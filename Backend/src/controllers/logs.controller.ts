import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

class LogManager {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private clients: Response[] = [];
  private isInitialized: boolean = false;

  constructor() {
    // Don't initialize in constructor, do it explicitly
  }

  public initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.interceptConsole();
  }

  private interceptConsole() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      self.addLog('info', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      self.addLog('error', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      self.addLog('warn', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args);
      self.addLog('info', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };
  }

  private addLog(level: string, message: string) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    this.logs.push(logEntry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    setImmediate(() => {
      this.broadcastToClients(logEntry);
    });
  }

  private broadcastToClients(log: LogEntry) {
    if (this.clients.length === 0) return;
    
    const data = `data: ${JSON.stringify(log)}\n\n`;
    const deadClients: Response[] = [];
    
    this.clients.forEach((client) => {
      try {
        const canWrite = client.write(data);
        if (!canWrite) {
          deadClients.push(client);
        }
      } catch {
        deadClients.push(client);
      }
    });
    
    deadClients.forEach(client => {
      const index = this.clients.indexOf(client);
      if (index > -1) {
        this.clients.splice(index, 1);
      }
    });
  }

  public getLogs(limit?: number): LogEntry[] {
    if (limit) {
      return this.logs.slice(-limit);
    }
    return this.logs;
  }

  public addClient(client: Response) {
    this.clients.push(client);
  }

  public removeClient(client: Response) {
    const index = this.clients.indexOf(client);
    if (index > -1) {
      this.clients.splice(index, 1);
    }
  }

  public getClientCount(): number {
    return this.clients.length;
  }

  public clearLogs() {
    this.logs = [];
  }
}

const logManager = new LogManager();

export const getHistoricalLogs = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const logs = logManager.getLogs(limit);
  
  res.json({
    success: true,
    data: logs,
  });
});

export const streamLogs = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  logManager.addClient(res);

  const welcomeMessage = {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `✅ Connected to log stream successfully (${logManager.getClientCount()} active clients)`
  };
  res.write(`data: ${JSON.stringify(welcomeMessage)}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(keepAlive);
      logManager.removeClient(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    logManager.removeClient(res);
  });
};

export const initializeLogManager = () => {
  logManager.initialize();
};

export const clearLogs = asyncHandler(async (req: Request, res: Response) => {
  logManager.clearLogs();
  
  res.json({
    success: true,
    message: 'Logs cleared successfully',
  });
});

