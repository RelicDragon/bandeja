let adsActiveTab = 'sponsors';

function switchAdsMainTab(tab) {
    adsActiveTab = tab;
    document.querySelectorAll('.ads-main-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.adsTab === tab);
    });
    document.querySelectorAll('.ads-main-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `adsMainPanel${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
    });
    if (tab === 'sponsors') loadAdsSponsorsTab();
    else if (tab === 'campaigns') loadAdsCampaignsTab();
    else if (tab === 'analytics') loadAdsAnalyticsTab();
}

async function loadSponsorAdsPage() {
    try {
        if (!adsSponsorsCache.length) {
            adsSponsorsCache = await fetchAdSponsors().catch(() => []);
        }
    } catch {
        /* ignore */
    }
    switchAdsMainTab(adsActiveTab);
}

function initSponsorAdsPage() {
    document.querySelectorAll('.ads-main-tab').forEach((btn) => {
        btn.addEventListener('click', () => switchAdsMainTab(btn.dataset.adsTab));
    });
}

document.addEventListener('DOMContentLoaded', initSponsorAdsPage);

window.loadSponsorAdsPage = loadSponsorAdsPage;
