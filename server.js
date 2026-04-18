const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 45000,
    pingTimeout: 60000,
  });

  // Socket.IO connection handler
  io.on('connection', async (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Device registration
    socket.on('register_device', async (data) => {
      try {
        const rfidHandler = require('./src/lib/rfid-websocket');
        await rfidHandler.registerDevice(socket, {
          ...data,
          socketId: socket.id,
        });
      } catch (error) {
        console.error('Error registering device:', error);
        socket.emit('error', { message: 'Failed to register device' });
      }
    });

    // RFID scan event
    socket.on('rfid_scan', async (data) => {
      try {
        const rfidHandler = require('./src/lib/rfid-websocket');
        await rfidHandler.handleRFIDScan(socket, data);
      } catch (error) {
        console.error('Error handling RFID scan:', error);
        socket.emit('error', { message: 'Failed to process scan' });
      }
    });


    socket.on('heartbeat', (data) => {
      socket.emit('heartbeat_ack', {
        serverTime: new Date().toISOString(),
        deviceId: data.deviceId,
      });
    });

    // Get connected devices list
    socket.on('get_devices', () => {
      const rfidHandler = require('./src/lib/rfid-websocket');
      socket.emit('devices_list', {
        devices: rfidHandler.getActiveDevices(),
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      const deviceId = socket.handshake.query.deviceId || socket.data.deviceId;
      if (deviceId) {
        const rfidHandler = require('./src/lib/rfid-websocket');
        await rfidHandler.handleDeviceDisconnect(deviceId);
      }
      console.log(`Client disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`Socket error from ${socket.id}:`, error);
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> Socket.IO server ready on ws://localhost:${port}`);
  });
});
