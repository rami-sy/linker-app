// WebRTCProvider.js
import React, {
  useRef,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useState,
} from "react";
import Peer from "simple-peer";
import { SocketContext } from "../contexts/socket.context";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
  MediaStreamTrack,
  registerGlobals,
} from "../components/chat/web-rtc";
import { useDispatch, useSelector } from "react-redux";
import { Platform } from "react-native";
// import ForegroundService from "@voximplant/react-native-foreground-service";
// Note: react-native-incall-manager is not tested on New Architecture (required in SDK 54)
// It's added to expo.doctor.exclude in package.json. Monitor for updates or alternatives.
import InCallManager from "react-native-incall-manager";
import {
  addRemoteStream,
  removeRemoteStream,
  setCallerSignal,
  setCallerUser,
  setCallStatus,
  setIsFrontCamera,
  setIsMicOn,
  setIsMinimized,
  setIsSpeakerOn,
  setIsVideoCall,
  setLocalStream,
  setRemoteStreams,
  setRoom,
  updateRemoteStreams,
} from "../redux/callSlice";
import { Device, detectDevice } from "mediasoup-client";
import Bowser from "bowser";

export const WebRTCContext = createContext();

export const WebRTCProvider = ({ children }) => {
  const { socket } = useContext(SocketContext);
  const { user } = useSelector((state) => state.users);
  const device = useRef(null);
  const { localStream } = useSelector((state) => state.calls);
  const perducerTransport = useRef(null);
  const videoProducer = useRef(null);
  const audioProducer = useRef(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [stats, setStats] = useState(null);
  // const {
  //   callStatus,
  //   room,
  //   isVideoCall,
  //   isFrontCamera,
  //   isSpeakerOn,
  //   localStream,
  //   remoteStreams,
  // } = useSelector((state) => state.calls);
  const dispatch = useDispatch();

  // 1. الحصول على الفيديو والصوت
  const startMedia = async (isVideoCall, videoFacingMode = "user") => {
    try {
      let stream;
      if (isVideoCall) {
        stream = await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: videoFacingMode },
        });
      } else {
        stream = await mediaDevices.getUserMedia({ audio: true });
      }

      await dispatch(setIsVideoCall(isVideoCall));
      return stream;
    } catch (error) {
      console.error("Error accessing media devices", error);
      return null;
    }
  };

  const createPerducerTransport = (socket, device) =>
    new Promise(async (resolve, reject) => {
      const producerTransportParams = await socket.emitWithAck(
        "requestTransport",
        {
          type: "producer",
        }
      );

      const producerTransport = device.current.createSendTransport(
        producerTransportParams
      );

      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          console.log("producerTransport connected");

          const connectResp = await socket.emitWithAck("connectTransport", {
            dtlsParameters,
            type: "producer",
          });
          console.log({ connectResp });
          if (connectResp === "success") {
            // we are connected! move forward
            callback();
          } else if (connectResp === "error") {
            // connection failed. Stop
            errback();
          }
        }
      );

      producerTransport.on("produce", async (params, callback, errorback) => {
        console.log("producerTransport produce", params);
        const { kind, rtpParameters } = params;
        const startProducingResp = await socket.emitWithAck("startProducing", {
          kind,
          rtpParameters,
        });
        if (startProducingResp === "error") {
          errorback();
        } else {
          console.log("startProducingResp", startProducingResp);
          callback({ id: startProducingResp.id });
        }
      });

      console.log({ producerTransport });

      // setInterval(async () => {
      //   const currentStats = await producerTransport.getStats();
      //   console.log({ currentStats });
      //   for (const report of currentStats.values()) {
      //     if (report.type === "outbound-rtp") {
      //       console.log(report.timestamp, report.bytesSent, report.packetsSent);
      //     }
      //   }
      // }, 1000);

      resolve(producerTransport);
    });

  const createProducer = (stream, producerTransport) => {
    return new Promise(async (resolve, reject) => {
      //get the audio and video tracks so we can produce
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      try {
        // running the produce method, will tell the transport
        // connect event to fire!!
        console.log("Calling produce on video");
        const videoProducer = await producerTransport.produce({
          track: videoTrack,
        });
        console.log("Calling produce on audio");
        const audioProducer = await producerTransport.produce({
          track: audioTrack,
        });
        console.log("finished producing!");
        resolve({ audioProducer, videoProducer });
      } catch (err) {
        console.log(err, "error producing");
      }
    });
  };

  // 2. بدء المكالمة - المستخدم الأول
  const joinRoom = async ({ user, room: startRoom, isVideoCall }) => {
    dispatch(setCallStatus("calling"));
    dispatch(setRoom(startRoom));

    const joinRoomResp = await socket.emitWithAck("joinRoom", {
      roomId: startRoom._id,
      userId: user._id,
      isVideoCall,
    });

    let handlerName;
    let deviceInstance;
    if (Platform.OS === "web") {
      // على الويب، استخدم Bowser لاكتشاف المتصفح
      const browser = Bowser.getParser(window.navigator.userAgent);
      const browserName = browser.getBrowserName();
      const browserVersion = parseInt(browser.getBrowserVersion(), 10);

      // 'Chrome111' | 'Chrome74' | 'Chrome70' | 'Chrome67' | 'Chrome55' | 'Firefox120' | 'Firefox60' | 'Safari12' | 'Safari11' | 'Edge11' | 'ReactNativeUnifiedPlan' | 'ReactNative';
      if (browserName === "Chrome" && browserVersion >= 111) {
        handlerName = "Chrome111";
      } else if (browserName === "Chrome" && browserVersion >= 74) {
        handlerName = "Chrome74";
      } else if (browserName === "Firefox" && browserVersion >= 120) {
        handlerName = "Firefox120";
      } else if (browserName === "Safari" && browserVersion < 12) {
        handlerName = "Safari11";
      } else if (browserName === "Safari" && browserVersion >= 12) {
        handlerName = "Safari12";
      } else if (browserName === "Edge" || browserName === "Microsoft Edge") {
        handlerName = "Chrome111";
      } else if (browserName === "Android Browser") {
        handlerName = "Chrome111";
      } else {
        // إذا لم يتم التعرف على المتصفح، يمكنك إظهار رسالة خطأ أو استخدام معالج افتراضي
        handlerName = "ReactNativeUnifiedPlan";
      }

      deviceInstance = new Device({ handlerName });
    } else {
      // على الأجهزة المحمولة، استخدم معالج ReactNative
      handlerName = "ReactNativeUnifiedPlan";

      deviceInstance = new Device({ handlerName });
    }

    device.current = deviceInstance;

    await device.current.load({
      routerRtpCapabilities: joinRoomResp.routerRtpCapabilities,
    });
    console.log({ joinRoomResp });

    const stream = await startMedia(isVideoCall);
    await dispatch(setLocalStream(stream));

    perducerTransport.current = await createPerducerTransport(socket, device);
    console.log({ localStream, stream });

    const producer = await createProducer(stream, perducerTransport.current);
    console.log({ producer });
    videoProducer.current = producer.videoProducer;
    audioProducer.current = producer.audioProducer;
    setIsMicOn(true);

    console.log("we are here");

    // dispatch(setCallStatus("connected"));
  };

  const closeRoom = () => {
    dispatch(setCallStatus("idle"));
    dispatch(setLocalStream(null));
  };

  const toggleMic = ({ room, user }) => {
    console.log({ room, user });
    console.log("audioProducer?.current", audioProducer?.current.paused);
    if (audioProducer.current.paused) {
      audioProducer.current.resume();
      setIsMicOn(true);
      socket.emit("audioChange", {
        isMicOn: true,
        userId: user._id,
        roomId: room._id,
      });
    } else {
      audioProducer.current.pause();
      setIsMicOn(false);
      socket.emit("audioChange", {
        isMicOn: false,
        userId: user._id,
        roomId: room._id,
      });
    }
  };

  return (
    <WebRTCContext.Provider
      value={{
        joinRoom,
        closeRoom,
        toggleMic,
        isMicOn,
      }}
    >
      {children}
    </WebRTCContext.Provider>
  );
};

export const useWebRTC = () => useContext(WebRTCContext);
