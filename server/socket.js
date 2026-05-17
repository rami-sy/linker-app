const { Server } = require("socket.io");
const messageHandlers = require("./src/sockets/handlers/message.handlers");
const e2eeHandlers = require("./src/sockets/handlers/e2ee.handlers");
const roomHandlers = require("./src/sockets/handlers/room.handlers");
const userHandlers = require("./src/sockets/handlers/user.handlers");
const postHandlers = require("./src/sockets/handlers/post.handlers");
const mediasoupHandlers = require("./src/sockets/handlers/mediasoup.handlers");
const User = require("./src/models/user.model");
const jwt = require("jsonwebtoken");
const config = require("./src/config/auth.config.js");
const RoomModel = require("./src/models/room.model.js");
const { default: mongoose } = require("mongoose");
const cron = require("node-cron");
const {
  userDisconnected,
  addUserSocketMapping,
  removeUserSocketMapping,
} = require("./src/sockets/services/user.services.js");
const logger = require("./src/utils/logger");
const { socketIoCorsOrigin } = require("./src/utils/corsOrigins");

// MediaSoup
const workerManager = require("./src/mediasoup/worker-manager");
const roomManager = require("./src/mediasoup/room-manager");

var middleware = require("socketio-wildcard")();

let io;
let adapterPubClient;
let adapterSubClient;

const setupRedisAdapter = async (ioInstance, redisClient) => {
  const enableRedisAdapter = process.env.SOCKET_REDIS_ADAPTER_ENABLED === "true";
  if (!enableRedisAdapter) {
    logger.info("Socket.IO Redis adapter disabled by configuration");
    return;
  }
  if (!redisClient?.isReady) {
    logger.warn("Socket.IO Redis adapter requested but Redis is not ready");
    return;
  }

  try {
    // Optional dependency: app keeps working on single instance when not installed.
    const { createAdapter } = require("@socket.io/redis-adapter");
    adapterPubClient = redisClient.duplicate();
    adapterSubClient = redisClient.duplicate();
    await Promise.all([adapterPubClient.connect(), adapterSubClient.connect()]);
    ioInstance.adapter(createAdapter(adapterPubClient, adapterSubClient));
    logger.info("Socket.IO Redis adapter enabled");
  } catch (error) {
    logger.warn("Socket.IO Redis adapter unavailable; using local adapter", {
      error: error?.message,
    });
  }
};

// const initMediasoup = async () => {
//   workers = await createWorkers();
//   console.log("mediasoup initialized");
// };

// initMediasoup();

// const mediasoupHandlers = ({ socket, io, redisClient }) => {
//   let client = null;
//   const handshake = socket.handshake;

//   socket.on('joinRoom', async({userName,roomName},ackCb)=>{
//     let newRoom = false
//     client = new Client(userName,socket)
//     let requestedRoom = rooms.find(room=> room.roomName === roomName)
//     if(!requestedRoom){
//         newRoom = true
//         // make the new room, add a worker, add a router
//         const workerToUse = await getWorker(workers)
//         requestedRoom = new Room(roomName,workerToUse)
//         await requestedRoom.createRouter(io)
//         rooms.push(requestedRoom)
//     }
//     // add the room to the client
//     client.room = requestedRoom
//     // add the client to the Room clients
//     client.room.addClient(client)
//     // add this socket to the socket room
//     socket.join(client.room.roomName)

//     //fetch the first 0-5 pids in activeSpeakerList
//     const audioPidsToCreate = client.room.activeSpeakerList.slice(0,5)
//     //find the videoPids and make an array with matching indicies
//     // for our audioPids.
//     const videoPidsToCreate = audioPidsToCreate.map(aid=>{
//         const producingClient = client.room.clients.find(c=>c?.producer?.audio?.id === aid)
//         return producingClient?.producer?.video?.id
//     })
//     //find the username and make an array with matching indicies
//     // for our audioPids/videoPids.
//     const associatedUserNames = audioPidsToCreate.map(aid=>{
//         const producingClient = client.room.clients.find(c=>c?.producer?.audio?.id === aid)
//         return producingClient?.userName
//     })

//     ackCb({
//         routerRtpCapabilities: client.room.router.rtpCapabilities,
//         newRoom,
//         audioPidsToCreate,
//         videoPidsToCreate,
//         associatedUserNames
//     })
//   })
//   socket.on('requestTransport',async({type,audioPid},ackCb)=>{
//       // whether producer or consumer, client needs params
//       let clientTransportParams
//       if(type === "producer"){
//           // run addClient, which is part of our Client class
//           clientTransportParams = await client.addTransport(type)
//       }else if(type === "consumer"){
//           // we have 1 trasnport per client we are streaming from
//           // each trasnport will have an audio and a video producer/consumer
//           // we know the audio Pid (because it came from dominantSpeaker), get the video
//           const producingClient = client.room.clients.find(c=>c?.producer?.audio?.id === audioPid)
//           const videoPid = producingClient?.producer?.video?.id
//           clientTransportParams = await client.addTransport(type,audioPid,videoPid)
//       }
//       ackCb(clientTransportParams)
//   })
//   socket.on('connectTransport',async({dtlsParameters,type,audioPid},ackCb)=>{
//       if(type === "producer"){
//           try{
//               await client.upstreamTransport.connect({dtlsParameters})
//               ackCb("success")
//           }catch(error){
//               console.log(error)
//               ackCb('error')
//           }
//       }else if(type === "consumer"){
//           // find the right transport, for this consumer
//           try{
//               const downstreamTransport = client.downstreamTransports.find(t=>{
//                   return t.associatedAudioPid === audioPid
//               })
//               downstreamTransport.transport.connect({dtlsParameters})
//               ackCb("success")
//           }catch(error){
//               console.log(error)
//               ackCb("error")
//           }
//       }
//   })
//   socket.on('startProducing',async({kind,rtpParameters},ackCb)=>{
//       // create a producer with the rtpParameters we were sent
//       try{
//           const newProducer = await client.upstreamTransport.produce({kind,rtpParameters})
//           //add the producer to this client obect
//           client.addProducer(kind,newProducer)
//           if(kind === "audio"){
//               client.room.activeSpeakerList.push(newProducer.id)
//           }
//           // the front end is waiting for the id
//           ackCb(newProducer.id)
//       }catch(err){
//           console.log(err)
//           ackCb(err)
//       }

//       // run updateActiveSpeakers
//       const newTransportsByPeer = updateActiveSpeakers(client.room,io)
//       // newTransportsByPeer is an object, each property is a socket.id that
//       // has transports to make. They are in an array, by pid
//       for(const [socketId, audioPidsToCreate] of Object.entries(newTransportsByPeer)){
//           // we have the audioPidsToCreate this socket needs to create
//           // map the video pids and the username
//           const videoPidsToCreate = audioPidsToCreate.map(aPid=>{
//               const producerClient = client.room.clients.find(c=>c?.producer?.audio?.id === aPid)
//               return producerClient?.producer?.video?.id
//           })
//           const associatedUserNames = audioPidsToCreate.map(aPid=>{
//               const producerClient = client.room.clients.find(c=>c?.producer?.audio?.id === aPid)
//               return producerClient?.userName
//           })
//           io.to(socketId).emit('newProducersToConsume',{
//               routerRtpCapabilities: client.room.router.rtpCapabilities,
//               audioPidsToCreate,
//               videoPidsToCreate,
//               associatedUserNames,
//               activeSpeakerList: client.room.activeSpeakerList.slice(0,5)
//           })
//       }
//   })
//   socket.on('audioChange',typeOfChange=>{
//       if(typeOfChange === "mute"){
//           client?.producer?.audio?.pause()
//       }else{
//           client?.producer?.audio?.resume()
//       }
//   })
//   socket.on('consumeMedia',async({rtpCapabilities,pid,kind},ackCb)=>{
//       // will run twice for every peer to consume... once for video, once for audio
//       console.log("Kind: ",kind,"   pid:",pid)
//       // we will set up our clientConsumer, and send back the params
//       // use the right transport and add/update the consumer in Client
//       // confirm canConsume
//       try{
//           if(!client.room.router.canConsume({producerId:pid, rtpCapabilities})){
//               ackCb("cannotConsume")
//           }else{
//               // we can consume!
//               const downstreamTransport = client.downstreamTransports.find(t=>{
//                   if(kind === "audio"){
//                       return t.associatedAudioPid === pid
//                   }else if(kind === "video"){
//                       return t.associatedVideoPid === pid
//                   }
//               })
//               // create the consumer with the transport
//               const newConsumer = await downstreamTransport.transport.consume({
//                   producerId: pid,
//                   rtpCapabilities,
//                   paused: true //good practice
//               })
//               // add this newCOnsumer to the CLient
//               client.addConsumer(kind,newConsumer,downstreamTransport)
//               // respond with the params
//               const clientParams = {
//                   producerId: pid,
//                   id: newConsumer.id,
//                   kind: newConsumer.kind,
//                   rtpParameters: newConsumer.rtpParameters
//               }
//               ackCb(clientParams)
//           }
//       }catch(err){
//           console.log(err)
//           ackCb('consumeFailed')
//       }
//   })
//   socket.on('unpauseConsumer',async({pid,kind},ackCb)=>{
//       const consumerToResume = client.downstreamTransports.find(t=>{
//           return t?.[kind].producerId === pid
//       })
//       await consumerToResume[kind].resume()
//       ackCb()
//   })
// };

module.exports.initIO = async (httpServer, redisClient) => {
  // ✅ TLS/SSL Configuration for Socket.IO
  const { TLSConfig } = require("./src/utils/encryptionService");
  const socketTLSOptions = TLSConfig.getSocketTLSOptions();

  io = new Server(httpServer, {
    cors: {
      origin: socketIoCorsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // ✅ Enable TLS for Socket.IO if available
    ...(socketTLSOptions
      ? {
          transports: ["websocket", "polling"],
          allowEIO3: true,
        }
      : {}),
  });

  if (socketTLSOptions) {
    logger.info("Socket.IO configured with TLS");
  }

  await setupRedisAdapter(io, redisClient);

  // Token validation middleware
  io.use(middleware);
  io.use((socket, next) => {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.token;

    if (!token) {
      return next(new Error("Authentication error: Token is required"));
    }

    // Verify the token (assuming you are using JWT for tokens)
    jwt.verify(token, config.secret, (err, decoded) => {
      if (err) {
        return next(new Error("Authentication error: Invalid token"));
      }

      const expiryDate = new Date(decoded.exp * 1000); // تحويل `exp` إلى تاريخ
      const currentDate = new Date();
      const timeDifference = expiryDate - currentDate;
      const daysRemaining = Math.ceil(timeDifference / (1000 * 60 * 60 * 24)); // تحويل الفرق إلى أيام

      // Token is valid, attach the user ID to the socket object
      socket.user = {
        ...decoded,
        daysRemaining, // إضافة عدد الأيام المتبقية إلى معلومات المستخدم
      }; // decoded.id should be the user ID
      next();
    });
  });

  // ✅ Initialize Session Manager
  const { initializeSessionManager } = require("./src/utils/sessionManager");
  const sessionManager = initializeSessionManager(redisClient, io);

  // Socket.IO connection
  io.on("connection", async (socket) => {
    let lastPresenceWriteAt = 0;
    const presenceWriteIntervalMs = Number(
      process.env.PRESENCE_WRITE_INTERVAL_MS || 5000
    );
    // ✅ Register session
    if (socket.user?._id) {
      await sessionManager.registerSession(socket.id, socket.user._id);
    }

    socket.on("*", function (packet) {
      // ✅ Update session activity
      if (socket.user?._id) {
        sessionManager.updateSessionActivity(socket.id);
        const now = Date.now();
        if (
          redisClient?.isReady &&
          now - lastPresenceWriteAt >= presenceWriteIntervalMs
        ) {
          lastPresenceWriteAt = now;
          redisClient.set(`lastSeen:${socket.user._id}`, Date.now());
          addUserSocketMapping({
            redisClient,
            userId: socket.user._id,
            socketId: socket.id,
          }).catch(() => {});
        }
      }
    });
    // emit the socket id back to the client
    const user = await User.findById(socket?.user?._id);
    if (user) {
      socket.emit("socketId", { socketId: socket.id });
    } else {
      logger.error("User not found", { userId: socket?.user?._id });
      socket.emit("userNotFound", { error: "User not found" });
    }

    // Socket handlers
    messageHandlers({ socket, io, redisClient });
    e2eeHandlers({ socket, io, redisClient });
    roomHandlers({ socket, io, redisClient });
    userHandlers({ socket, io, redisClient });
    postHandlers({ socket, io, redisClient });
    mediasoupHandlers({ socket, io, redisClient });

    // ✅ Simulcast handlers
    const simulcastHandlers = require("./src/sockets/handlers/simulcast.handlers");
    simulcastHandlers({ socket, io, redisClient });

    socket.on("disconnect", async () => {
      // ✅ Remove session on disconnect
      if (socket.user?._id) {
        if (redisClient?.isReady) {
          await removeUserSocketMapping({
            redisClient,
            userId: socket.user._id,
            socketId: socket.id,
          });
        }
        await sessionManager.removeSession(socket.id);
        logger.info("Session removed on disconnect", {
          socketId: socket.id,
          userId: socket.user._id,
        });
      }
    });
  });

  cron.schedule("*/10 * * * *", async () => {
    if (!redisClient?.isReady) {
      logger.warn("Skipping inactive-user cron: Redis not ready");
      return;
    }
    const currentTime = Date.now();
    logger.debug("Cron job: Checking inactive users");
    // Use SCAN iterator instead of KEYS to avoid blocking Redis.
    for await (const key of redisClient.scanIterator({
      MATCH: "lastSeen:*",
      COUNT: 100,
    })) {
      const lastSeen = await redisClient.get(key);

      if (currentTime - lastSeen > 10 * 60 * 1000) {
        const userId = key.split(":")[1]; // استخراج الـ userId من الـ key
        logger.debug("Checking user last seen", { userId, lastSeen });
        logger.debug("Processing inactive user", { userId });
        // تحديث حالة المستخدم إلى "offline" في قاعدة البيانات
        const user = await User.findById(userId);
        logger.debug("Updating user status to offline", {
          userId,
          user: user?._id,
        });
        if (user) {
          user.status = "offline";
          user.lastSeen = new Date();
          await user.save();
          logger.debug("User status updated to offline", { userId });
          await redisClient.del(`lastSeen:${userId}`);
          // إرسال التحديث لجميع المستخدمين المتصلين عبر الـ sockets
          io.emit("userStatusChange", { userId: userId, status: "offline" });
        }
      }
    }
  });
};

module.exports.getIO = () => {
  if (!io) {
    throw Error("IO not initilized.");
  } else {
    return io;
  }
};
