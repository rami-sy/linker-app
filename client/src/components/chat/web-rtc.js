import { Platform } from "react-native";

let RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  RTCView,
  MediaStream,
  MediaStreamTrack,
  registerGlobals;

if (Platform.OS === "web") {
  const webRTC = require("react-native-webrtc-web-shim");
  RTCPeerConnection = webRTC.RTCPeerConnection;
  RTCSessionDescription = webRTC.RTCSessionDescription;
  RTCIceCandidate = webRTC.RTCIceCandidate;
  mediaDevices = webRTC.mediaDevices;
  RTCView = webRTC.RTCView;
  MediaStream = webRTC.MediaStream;
  MediaStreamTrack = webRTC.MediaStreamTrack;
  registerGlobals = webRTC.registerGlobals;
} else {
  const nativeRTC = require("react-native-webrtc");
  RTCPeerConnection = nativeRTC.RTCPeerConnection;
  RTCSessionDescription = nativeRTC.RTCSessionDescription;
  RTCIceCandidate = nativeRTC.RTCIceCandidate;
  mediaDevices = nativeRTC.mediaDevices;
  RTCView = nativeRTC.RTCView;
  MediaStream = nativeRTC.MediaStream;
  MediaStreamTrack = nativeRTC.MediaStreamTrack;
  registerGlobals = nativeRTC.registerGlobals;
}

export {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  RTCView,
  MediaStream,
  MediaStreamTrack,
  registerGlobals,
};
