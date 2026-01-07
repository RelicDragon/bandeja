/**
 * CRS (crs.rs) Club Integration Script
 * 
 * Fetches court availability from CRS booking system
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const CRS_URL = 'https://crs.rs/wp-admin/admin-ajax.php';

const COURT_NAMES = {
  3: 'Корт 1 (MINI)',
  4: 'Корт 2',
  9: 'Корт 3 (крытый)',
  10: 'Корт 4 (крытый)',
  12: 'Корт 5 (крытый)',
  13: 'Корт 6 (крытый)',
  14: 'Центральный корт',
};

const CUSTOM_DURATION_MAPPING = {
  3: 15,   // Корт 1 (MINI)
  4: null, // Корт 2 - no 2h
  9: null, // Корт 3 - no 2h
  10: 21,  // Корт 4
  12: 28,  // Корт 5
  13: 25,  // Корт 6
  14: 31,  // Центральный корт
};

const SERVICE_IDS = [3, 4, 9, 10, 12, 13, 14]; // All padel court service IDs

function getCourtName(serviceId) {
  return COURT_NAMES[serviceId] || `Court ${serviceId}`;
}

function getCustomDuration(serviceId) {
  return CUSTOM_DURATION_MAPPING[serviceId] || null;
}

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseCrsResponse(data, serviceId, expectedDuration = null) {
  const slots = [];

  try {
    if (typeof data === 'object' && data !== null) {
      if (data.data && typeof data.data === 'object' && data.data.dates) {
        const datesData = data.data.dates;

        for (const [dateKey, daySlots] of Object.entries(datesData)) {
          try {
            const [year, month, day] = dateKey.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);

            if (Array.isArray(daySlots)) {
              for (const slotData of daySlots) {
                if (typeof slotData === 'object' && slotData !== null) {
                  const startTime = slotData.start_time || '';
                  const endTime = slotData.end_time || '';
                  let duration = slotData.duration || 60;
                  const busy = slotData.busy || false;
                  const maxCapacity = slotData.max_capacity || '1';

                  if (expectedDuration !== null) {
                    duration = expectedDuration;
                  }

                  if (startTime && startTime.includes(':')) {
                    try {
                      const { hours, minutes } = parseTime(startTime);
                      const slotDateTime = new Date(dateObj);
                      slotDateTime.setHours(hours, minutes, 0, 0);

                      const endDateTime = new Date(slotDateTime);
                      endDateTime.setMinutes(endDateTime.getMinutes() + duration);

                      slots.push({
                        date: dateObj,
                        time: { hours, minutes },
                        serviceId: serviceId,
                        serviceName: getCourtName(serviceId),
                        available: !busy,
                        price: 0,
                        duration: duration,
                        endTime: endTime,
                        maxCapacity: maxCapacity,
                        startDateTime: slotDateTime,
                        endDateTime: endDateTime,
                      });
                    } catch (error) {
                      console.error(`[CRS] Error parsing time ${startTime}:`, error.message);
                      continue;
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`[CRS] Error parsing date ${dateKey}:`, error.message);
            continue;
          }
        }

        return slots;
      }
    }
  } catch (error) {
    console.error('[CRS] Error parsing CRS response:', error.message);
  }

  return slots;
}

function makeRequest(url, formData, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const postData = new URLSearchParams(formData).toString();

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            console.error('[CRS] Failed to parse JSON response:', error.message);
            reject(new Error(`Failed to parse JSON: ${error.message}`));
          }
        } else {
          console.error(`[CRS] HTTP error ${res.statusCode}`);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('[CRS] Request error:', error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSlots(params) {
  const { startDate, endDate, duration, clubConfig } = params;

  const headers = {
    accept: '*/*',
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    origin: 'https://crs.rs',
    referer: 'https://crs.rs/zakazivanje-termina/',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'x-requested-with': 'XMLHttpRequest',
  };

  const allSlots = [];

  for (const serviceId of SERVICE_IDS) {
    try {
      const cart = JSON.stringify([
        {
          location: -1,
          staff: -1,
          service_category: 4,
          service: serviceId,
          service_extras: [],
          date: '',
          time: '',
          brought_people_count: 0,
          recurring_start_date: '',
          recurring_end_date: '',
          recurring_times: '{}',
          appointments: '[]',
          customer_id: 0,
          customer_data: {
            email: '',
            first_name: '',
            last_name: '',
            phone: '',
          },
        },
      ]);

      const formData = {
        action: 'bkntc_get_data',
        current_step: 'date_time',
        previous_step: 'service',
        cart: cart,
        current: '0',
        query_params: '{}',
        tenant_id: '',
      };

      const response = await makeRequest(CRS_URL, formData, headers);
      const slots = parseCrsResponse(response, serviceId);
      allSlots.push(...slots);

      await sleep(500);

      const customDuration = getCustomDuration(serviceId);
      if (customDuration !== null) {
        const cart2h = JSON.stringify([
          {
            location: -1,
            staff: -1,
            service_category: 4,
            service: serviceId,
            service_extras: [],
            date: '',
            time: '',
            brought_people_count: 0,
            recurring_start_date: '',
            recurring_end_date: '',
            recurring_times: '{}',
            appointments: '[]',
            customer_id: 0,
            customer_data: {
              email: '',
              first_name: '',
              last_name: '',
              phone: '',
            },
            custom_duration: customDuration,
          },
        ]);

        const formData2h = {
          action: 'bkntc_get_data',
          current_step: 'date_time',
          previous_step: 'service',
          cart: cart2h,
          current: '0',
          query_params: '{}',
          tenant_id: '',
        };

        const response2h = await makeRequest(CRS_URL, formData2h, headers);
        const slots2h = parseCrsResponse(response2h, serviceId, 120);
        allSlots.push(...slots2h);

        await sleep(500);
      }
    } catch (error) {
      console.error(`[CRS] Error processing service ${serviceId}:`, error.message);
      continue;
    }
  }

  const result = allSlots.map((slot) => {
    const slotDuration = slot.duration / 60;
    const endTime = new Date(slot.startDateTime);
    endTime.setMinutes(endTime.getMinutes() + slot.duration);

    return {
      externalCourtId: String(slot.serviceId),
      externalCourtName: slot.serviceName,
      startTime: slot.startDateTime.toISOString(),
      endTime: endTime.toISOString(),
      isBooked: !slot.available,
    };
  });

  console.log(`[CRS] Loaded ${result.length} slots`);

  return {
    slots: result,
    metadata: {
      fetchedAt: new Date().toISOString(),
      source: 'crs',
      totalSlotsFound: allSlots.length,
    },
  };
}

module.exports = getSlots;

