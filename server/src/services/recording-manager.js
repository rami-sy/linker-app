/**
 * ✅ Recording Manager
 * إدارة التسجيلات الفعلية باستخدام MediaSoup PlainTransport و GStreamer/FFmpeg
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const dgram = require('dgram');
const logger = require('../utils/logger');

/**
 * ✅ Generate SDP file for FFmpeg RTP input
 * FFmpeg needs SDP file to know payload types and codecs
 */
function generateSDPFile(audioConsumers, videoConsumers, rtpPort, rtcpPort) {
  let sdpContent = 'v=0\r\n';
  sdpContent += 'o=- 0 0 IN IP4 127.0.0.1\r\n';
  sdpContent += 's=MediaSoup Recording\r\n';
  sdpContent += 't=0 0\r\n';
  
  // Audio streams
  if (audioConsumers.length > 0) {
    const audioConsumer = audioConsumers[0];
    // Get rtpParameters - check both direct property and nested consumer
    const rtpParams = audioConsumer.rtpParameters || audioConsumer.consumer?.rtpParameters;
    
    logger.debug('Audio consumer RTP parameters:', {
      hasRtpParams: !!rtpParams,
      hasCodecs: !!(rtpParams && rtpParams.codecs),
      codecsCount: rtpParams?.codecs?.length || 0,
      codecs: rtpParams?.codecs?.map(c => ({ mimeType: c.mimeType, kind: c.kind, payloadType: c.payloadType })) || []
    });
    
    if (rtpParams && rtpParams.codecs && rtpParams.codecs.length > 0) {
      // Find the main audio codec (not RTX, not RED)
      // Note: codecs in rtpParameters don't have a 'kind' property, they're identified by mimeType
      const audioCodec = rtpParams.codecs.find(c => {
        const mimeType = c.mimeType.toLowerCase();
        return mimeType.startsWith('audio/') && 
               !mimeType.includes('rtx') && 
               !mimeType.includes('red');
      });
      
      if (audioCodec) {
        const ssrc = rtpParams.encodings?.[0]?.ssrc || 11111111;
        const codecName = audioCodec.mimeType.split('/')[1].toLowerCase(); // opus, pcmu, etc.
        const channels = audioCodec.channels || 2;
        
        sdpContent += `m=audio ${rtpPort} RTP/AVP ${audioCodec.payloadType}\r\n`;
        sdpContent += `c=IN IP4 127.0.0.1\r\n`;
        if (rtcpPort) {
          sdpContent += `a=rtcp:${rtcpPort}\r\n`;
        }
        sdpContent += `a=rtpmap:${audioCodec.payloadType} ${codecName}/${audioCodec.clockRate}${channels > 1 ? '/' + channels : ''}\r\n`;
        sdpContent += `a=ssrc:${ssrc} cname:mediasoup\r\n`;
        sdpContent += `a=sendonly\r\n`; // FFmpeg receives, so this is sendonly from MediaSoup perspective
        
        logger.debug('Audio SDP media line added:', {
          port: rtpPort,
          payloadType: audioCodec.payloadType,
          codec: codecName,
          clockRate: audioCodec.clockRate,
          channels: channels
        });
      } else {
        logger.warn('No valid audio codec found in consumer RTP parameters', {
          availableCodecs: rtpParams.codecs.map(c => c.mimeType)
        });
      }
    } else {
      logger.warn('No RTP parameters or codecs found in audio consumer', {
        hasRtpParams: !!rtpParams,
        hasCodecs: !!(rtpParams && rtpParams.codecs),
        codecsLength: rtpParams?.codecs?.length
      });
    }
  }
  
  // Video streams
  if (videoConsumers.length > 0) {
    const videoConsumer = videoConsumers[0];
    const rtpParams = videoConsumer.rtpParameters || videoConsumer.consumer?.rtpParameters;
    
    logger.debug('Video consumer RTP parameters:', {
      hasRtpParams: !!rtpParams,
      hasCodecs: !!(rtpParams && rtpParams.codecs),
      codecsCount: rtpParams?.codecs?.length || 0,
      codecs: rtpParams?.codecs?.map(c => ({ mimeType: c.mimeType, kind: c.kind, payloadType: c.payloadType })) || []
    });
    
    if (rtpParams && rtpParams.codecs && rtpParams.codecs.length > 0) {
      // Find the main video codec (not RTX, not RED)
      // Note: codecs in rtpParameters don't have a 'kind' property, they're identified by mimeType
      const videoCodec = rtpParams.codecs.find(c => {
        const mimeType = c.mimeType.toLowerCase();
        return mimeType.startsWith('video/') && 
               !mimeType.includes('rtx') && 
               !mimeType.includes('red');
      });
      
      if (videoCodec) {
        const ssrc = rtpParams.encodings?.[0]?.ssrc || 22222222;
        const codecName = videoCodec.mimeType.split('/')[1].toLowerCase(); // vp8, vp9, h264, etc.
        // Use separate port for video if we have both audio and video
        const videoRtpPort = audioConsumers.length > 0 ? rtpPort + 2 : rtpPort;
        const videoRtcpPort = audioConsumers.length > 0 && rtcpPort ? rtcpPort + 2 : rtcpPort;
        
        sdpContent += `m=video ${videoRtpPort} RTP/AVP ${videoCodec.payloadType}\r\n`;
        sdpContent += `c=IN IP4 127.0.0.1\r\n`;
        if (videoRtcpPort) {
          sdpContent += `a=rtcp:${videoRtcpPort}\r\n`;
        }
        sdpContent += `a=rtpmap:${videoCodec.payloadType} ${codecName}/${videoCodec.clockRate}\r\n`;
        sdpContent += `a=ssrc:${ssrc} cname:mediasoup\r\n`;
        sdpContent += `a=sendonly\r\n`; // FFmpeg receives, so this is sendonly from MediaSoup perspective
        
        logger.debug('Video SDP media line added:', {
          port: videoRtpPort,
          payloadType: videoCodec.payloadType,
          codec: codecName,
          clockRate: videoCodec.clockRate
        });
      } else {
        logger.warn('No valid video codec found in consumer RTP parameters', {
          availableCodecs: rtpParams.codecs.map(c => c.mimeType)
        });
      }
    } else {
      logger.warn('No RTP parameters or codecs found in video consumer', {
        hasRtpParams: !!rtpParams,
        hasCodecs: !!(rtpParams && rtpParams.codecs),
        codecsLength: rtpParams?.codecs?.length
      });
    }
  }
  
  return sdpContent;
}
const recordingService = require('./recording.service');

class RecordingManager {
  constructor() {
    this.activeRecordings = new Map(); // Map<callId, recordingData>
    this.recordingPath = process.env.RECORDING_PATH || path.join(__dirname, '../../recordings');
    this.useGStreamer = process.env.USE_GSTREAMER !== 'false'; // Default: true
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.gstreamerPath = process.env.GSTREAMER_PATH || 'gst-launch-1.0';
  }

  /**
   * ✅ Start recording a call/stream
   */
  async startRecording(callId, room, recordingInfo) {
    try {
      if (this.activeRecordings.has(callId.toString())) {
        logger.warn(`Recording already in progress for call: ${callId}`);
        return this.activeRecordings.get(callId.toString());
      }

      const router = room.router;
      if (!router) {
        throw new Error('Router not found for room');
      }

      // Get all producers from the room
      const producers = [];
      const audioProducers = [];
      const videoProducers = [];
      
      for (const peer of room.peers.values()) {
        for (const producer of peer.producers.values()) {
          if (producer.kind === 'audio' || producer.kind === 'video') {
            producers.push(producer);
            if (producer.kind === 'audio') {
              audioProducers.push(producer);
            } else if (producer.kind === 'video') {
              videoProducers.push(producer);
            }
          }
        }
      }

      logger.callEvent('Producers found for recording', {
        callId,
        totalProducers: producers.length,
        audioProducers: audioProducers.length,
        videoProducers: videoProducers.length,
      });

      if (producers.length === 0) {
        throw new Error('No producers found in room');
      }

      // Create PlainTransport for recording
      // ✅ PlainTransport will receive from router (via consumers)
      // With comedia: false, we must explicitly connect to FFmpeg
      // However, PlainTransport may not automatically forward data from consumers
      // to the remote endpoint. We need to ensure data flows correctly.
      const plainTransport = await router.createPlainTransport({
        listenIp: { ip: '127.0.0.1', announcedIp: '127.0.0.1' },
        rtcpMux: false,
        comedia: false, // Must be false - we'll explicitly connect
      });

      logger.callEvent('PlainTransport created for recording', {
        callId,
        transportId: plainTransport.id,
        producersCount: producers.length,
        tuple: plainTransport.tuple,
        rtcpTuple: plainTransport.rtcpTuple,
        connected: true,
      });

      // ✅ IMPORTANT: Create consumers AFTER FFmpeg starts listening
      // This prevents data accumulation in PlainTransport before FFmpeg is ready
      // We'll create consumers inside startRecordingProcess after FFmpeg is ready
      
      // Prepare file paths
      const fileName = `recording_${recordingInfo.recordingId}_${Date.now()}.${recordingInfo.format || 'mp4'}`;
      const filePath = path.join(this.recordingPath, fileName);
      const fileUrl = `/recordings/${fileName}`;

      // Start recording process (GStreamer or FFmpeg)
      // This will create consumers AFTER FFmpeg is ready
      const recordingProcess = await this.startRecordingProcess(
        plainTransport,
        producers,
        router,
        filePath,
        recordingInfo
      );
      
      // Get consumers from recording process
      const consumers = recordingProcess.consumers || [];

      // Store recording data
      const recordingData = {
        callId: callId.toString(),
        recordingId: recordingInfo.recordingId,
        type: recordingInfo.type,
        plainTransport,
        consumers,
        recordingProcess,
        filePath,
        sdpFilePath: recordingProcess?.sdpFilePath, // Save SDP file path for cleanup
        fileUrl,
        startedAt: Date.now(),
      };

      this.activeRecordings.set(callId.toString(), recordingData);

      logger.callEvent('Recording started successfully', {
        callId,
        recordingId: recordingInfo.recordingId,
        filePath,
        consumersCount: consumers.length,
      });

      return recordingData;
    } catch (error) {
      logger.error('Error starting recording:', error);
      throw error;
    }
  }

  /**
   * ✅ Start recording process (GStreamer or FFmpeg)
   * Now accepts producers and router, and creates consumers AFTER FFmpeg is ready
   */
  async startRecordingProcess(plainTransport, producers, router, filePath, recordingInfo) {
    if (this.useGStreamer) {
      return this.startGStreamerRecording(plainTransport, producers, router, filePath, recordingInfo);
    } else {
      return this.startFFmpegRecording(plainTransport, producers, router, filePath, recordingInfo);
    }
  }

  /**
   * ✅ Start GStreamer recording
   * Note: GStreamer implementation is complex, using FFmpeg as default
   */
  async startGStreamerRecording(plainTransport, producers, router, filePath, recordingInfo) {
    // Fallback to FFmpeg if GStreamer is not available
    logger.warn('GStreamer recording not fully implemented, falling back to FFmpeg');
    return this.startFFmpegRecording(plainTransport, producers, router, filePath, recordingInfo);
  }

  /**
   * ✅ Start FFmpeg recording
   * Now accepts producers and router, creates consumers AFTER FFmpeg is ready
   */
  async startFFmpegRecording(plainTransport, producers, router, filePath, recordingInfo) {
    // ✅ Create consumers immediately but keep them paused
    // We'll resume them after FFmpeg is ready to receive data
    const rtpCapabilities = router.rtpCapabilities;
    const consumers = [];
    const audioProducers = [];
    const videoProducers = [];
    
    for (const producer of producers) {
      if (producer.kind === 'audio') {
        audioProducers.push(producer);
      } else if (producer.kind === 'video') {
        videoProducers.push(producer);
      }
    }
    
    // Create consumers but keep them paused
    for (const producer of producers) {
      try {
        if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
          logger.warn(`Cannot consume producer ${producer.id} - codec mismatch`);
          continue;
        }
        
        const consumer = await plainTransport.consume({
          producerId: producer.id,
          rtpCapabilities: rtpCapabilities,
        });
        
        // ✅ Keep consumer paused - we'll resume after FFmpeg is ready
        // This prevents data accumulation before FFmpeg can receive it
        
        consumers.push({
          consumer,
          producer,
          kind: producer.kind,
          rtpParameters: consumer.rtpParameters,
        });
        
        logger.debug(`Consumer created (paused) for producer: ${producer.id}`, {
          producerId: producer.id,
          consumerId: consumer.id,
          kind: producer.kind,
        });
      } catch (error) {
        logger.error(`Error creating consumer for producer ${producer.id}:`, error);
      }
    }
    
    if (consumers.length === 0) {
      throw new Error('No consumers created');
    }
    
    // Extract consumers by kind for SDP file generation
    const audioConsumers = consumers.filter(c => c.kind === 'audio');
    const videoConsumers = consumers.filter(c => c.kind === 'video');
    const ffmpegArgs = [
      '-y', // Overwrite output file
      '-loglevel', 'warning',
      '-fflags', '+genpts', // Generate presentation timestamps
    ];

    // ✅ Get RTP port from PlainTransport
    // PlainTransport.tuple is available immediately after creation
    let rtpPort = null;
    let rtcpPort = null;
    
    try {
      // Get from tuple (available immediately)
      if (plainTransport.tuple) {
        rtpPort = plainTransport.tuple.localPort;
        logger.debug('Got RTP port from tuple:', rtpPort);
      }
      
      if (plainTransport.rtcpTuple) {
        rtcpPort = plainTransport.rtcpTuple.localPort;
        logger.debug('Got RTCP port from rtcpTuple:', rtcpPort);
      }
      
      // Fallback: try dump if tuple not available
      if (!rtpPort) {
        const transportDump = await plainTransport.dump();
        logger.debug('PlainTransport dump:', JSON.stringify(transportDump, null, 2));
        
        if (transportDump.tuple) {
          rtpPort = transportDump.tuple.localPort;
        }
        if (transportDump.rtcpTuple) {
          rtcpPort = transportDump.rtcpTuple.localPort;
        }
      }
      
      if (!rtpPort) {
        throw new Error('Cannot determine RTP port from PlainTransport');
      }
      
      logger.callEvent('RTP ports determined', {
        rtpPort,
        rtcpPort,
        hasTuple: !!plainTransport.tuple,
        hasRtcpTuple: !!plainTransport.rtcpTuple,
      });
    } catch (error) {
      logger.error('Error getting RTP port from PlainTransport:', error);
      throw new Error(`Failed to get RTP port: ${error.message}`);
    }

    // ✅ PlainTransport receives from router (via consumers) and sends to FFmpeg
    // FFmpeg needs SDP file to know payload types and codecs
    // Create SDP file from consumer RTP parameters
    let sdpFilePath = null;
    let ffmpegRtpPort = null;
    let ffmpegRtcpPort = null;
    
    if (videoConsumers.length > 0 || audioConsumers.length > 0) {
      if (!rtpPort) {
        throw new Error('RTP port not available');
      }
      
      // ✅ FFmpeg will listen on separate ports
      // PlainTransport listens on rtpPort, FFmpeg listens on ffmpegRtpPort
      // PlainTransport will send data to FFmpeg's listening port
      ffmpegRtpPort = rtpPort + 10000; // Use different port for FFmpeg
      ffmpegRtcpPort = rtcpPort ? rtcpPort + 10000 : null;
      
      // Generate SDP file content with FFmpeg listening ports
      const sdpContent = generateSDPFile(audioConsumers, videoConsumers, ffmpegRtpPort, ffmpegRtcpPort);
      sdpFilePath = filePath.replace('.mp4', '.sdp');
      
      // Write SDP file
      await fs.writeFile(sdpFilePath, sdpContent, 'utf8');
      logger.debug('SDP file created:', sdpFilePath);
      logger.debug('SDP content:', sdpContent);
      
      // ✅ DO NOT connect PlainTransport before FFmpeg starts
      // PlainTransport will accumulate data if connected before FFmpeg is ready
      // We'll connect it AFTER FFmpeg starts listening
      
      // Use SDP file with FFmpeg - FFmpeg will listen on ports specified in SDP
      // With comedia: true, PlainTransport will discover FFmpeg's IP/port automatically
      // from the first RTP/RTCP packet received
      ffmpegArgs.push(
        '-protocol_whitelist', 'file,udp,rtp',
        '-i', sdpFilePath
      );
      
      logger.debug('FFmpeg using SDP file:', sdpFilePath);
      logger.debug('PlainTransport listening on:', rtpPort);
      logger.debug('FFmpeg will listen on:', ffmpegRtpPort);
      // Note: PlainTransport will be connected AFTER FFmpeg starts
    } else {
      throw new Error('No audio or video consumers available for recording');
    }

    // ✅ Output settings - adjust based on available streams
    const hasVideo = videoConsumers.length > 0;
    const hasAudio = audioConsumers.length > 0;
    
    if (hasVideo) {
      // Video + Audio recording
      const resolution = recordingInfo.resolution || { width: 1280, height: 720 };
      const bitrate = recordingInfo.bitrate || 3000;
      const fps = recordingInfo.fps || 30;

      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${bitrate * 2}k`,
        '-r', fps.toString(),
        '-s', `${resolution.width}x${resolution.height}`,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-f', 'mp4',
        '-movflags', '+faststart', // Optimize for web playback
        filePath
      );
    } else if (hasAudio) {
      // Audio-only recording
      logger.info('Recording audio-only (no video streams available)');
      ffmpegArgs.push(
        '-vn', // No video
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-f', 'mp4', // Still use mp4 for compatibility
        '-movflags', '+faststart',
        filePath
      );
    } else {
      throw new Error('No audio or video consumers available for recording');
    }

    logger.callEvent('Starting FFmpeg recording', {
      filePath,
      args: ffmpegArgs.join(' '),
      ffmpegPath: this.ffmpegPath,
    });

    // ✅ Check if FFmpeg is available
    const { execSync } = require('child_process');
    try {
      execSync(`${this.ffmpegPath} -version`, { stdio: 'ignore', timeout: 2000 });
      logger.debug('FFmpeg found and ready', { ffmpegPath: this.ffmpegPath });
    } catch (error) {
      const errorMessage = `FFmpeg not found at "${this.ffmpegPath}". Please install FFmpeg:\n` +
        `  Windows: choco install ffmpeg\n` +
        `  Linux: sudo apt-get install ffmpeg\n` +
        `  macOS: brew install ffmpeg\n` +
        `  Or download from: https://ffmpeg.org/download.html\n` +
        `  You can also set FFMPEG_PATH environment variable to point to your FFmpeg executable.`;
      
      logger.error('FFmpeg not found! Please install FFmpeg:', {
        ffmpegPath: this.ffmpegPath,
        error: error.message,
        platform: process.platform,
      });
      throw new Error(errorMessage);
    }

    const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    ffmpegProcess.stdout.on('data', (data) => {
      logger.debug(`FFmpeg stdout: ${data.toString()}`);
    });

    // Capture stderr for debugging
    let ffmpegErrors = '';
    let ffmpegOutput = '';
    let ffmpegReady = false;
    
    ffmpegProcess.stderr.on('data', (data) => {
      const errorText = data.toString();
      ffmpegErrors += errorText;
      ffmpegOutput += errorText;
      
      // Check if FFmpeg is ready to receive RTP
      // FFmpeg may not always print "Stream #" immediately, so we'll use a timeout-based approach
      if (!ffmpegReady && (errorText.includes('Stream #') || errorText.includes('Input #') || errorText.includes('Output #') || errorText.includes('Opening'))) {
        ffmpegReady = true;
        
        // ✅ Resume consumers and connect PlainTransport after FFmpeg is ready
        // Use async IIFE to handle async operations in callback
        (async () => {
          try {
            // Resume all paused consumers
            for (const consumerData of consumers) {
              try {
                await consumerData.consumer.resume();
                logger.debug(`Consumer resumed for producer: ${consumerData.producer.id}`, {
                  consumerId: consumerData.consumer.id,
                });
              } catch (error) {
                logger.error(`Error resuming consumer for producer ${consumerData.producer.id}:`, error);
              }
            }
            
            // Store consumers in ffmpegProcess for later access
            ffmpegProcess.consumers = consumers;
            
            // ✅ Now connect PlainTransport to FFmpeg after consumers are resumed
            // This tells PlainTransport where to send RTP data
            if (sdpFilePath && ffmpegRtpPort) {
              plainTransport.connect({
                ip: '127.0.0.1',
                port: ffmpegRtpPort,
                rtcpPort: ffmpegRtcpPort,
              }).then(() => {
                logger.debug('PlainTransport connected to FFmpeg after FFmpeg started listening and consumers resumed');
              }).catch((error) => {
                logger.error('Error connecting PlainTransport to FFmpeg:', error);
              });
            }
          } catch (error) {
            logger.error('Error resuming consumers after FFmpeg ready:', error);
          }
        })();
      }
      
      // Log all FFmpeg output for debugging
      const lines = errorText.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('error')) {
          logger.error(`FFmpeg ERROR: ${line.trim()}`);
        } else if (lowerLine.includes('warning')) {
          logger.warn(`FFmpeg WARNING: ${line.trim()}`);
        } else if (lowerLine.includes('rtp') || lowerLine.includes('udp') || lowerLine.includes('stream') || lowerLine.includes('input')) {
          logger.debug(`FFmpeg: ${line.trim()}`);
        }
      }
    });

    ffmpegProcess.on('error', (error) => {
      logger.error('FFmpeg process error:', error);
    });

    // ✅ Fallback: Resume consumers and connect PlainTransport after a delay if FFmpeg doesn't signal readiness
    // This ensures connection is established even if FFmpeg takes longer to start
    setTimeout(async () => {
      if (!ffmpegReady && sdpFilePath && ffmpegRtpPort) {
        try {
          // Resume all paused consumers
          for (const consumerData of consumers) {
            try {
              await consumerData.consumer.resume();
              logger.debug(`Consumer resumed (fallback) for producer: ${consumerData.producer.id}`);
            } catch (error) {
              logger.error(`Error resuming consumer (fallback) for producer ${consumerData.producer.id}:`, error);
            }
          }
          
          // Store consumers in ffmpegProcess
          ffmpegProcess.consumers = consumers;
          
          // Connect PlainTransport to FFmpeg
          plainTransport.connect({
            ip: '127.0.0.1',
            port: ffmpegRtpPort,
            rtcpPort: ffmpegRtcpPort,
          }).then(() => {
            logger.debug('PlainTransport connected to FFmpeg (fallback after delay)');
          }).catch((error) => {
            logger.error('Error connecting PlainTransport to FFmpeg (fallback):', error);
          });
        } catch (error) {
          logger.error('Error in fallback consumer resume/connect:', error);
        }
      }
    }, 1500); // Wait 1.5 seconds for FFmpeg to start listening

    // Attach SDP file path and consumers to process for cleanup
    ffmpegProcess.sdpFilePath = sdpFilePath;
    ffmpegProcess.consumers = []; // Will be populated when FFmpeg is ready
    
    ffmpegProcess.on('exit', (code, signal) => {
      logger.callEvent('FFmpeg process exited', { 
        code, 
        signal,
        filePath,
        hasErrors: ffmpegErrors.length > 0,
      });
      
      if (code !== 0 && code !== null) {
        logger.error(`FFmpeg exited with error code ${code}`);
        if (ffmpegErrors) {
          logger.error('FFmpeg errors:', ffmpegErrors.substring(0, 1000)); // Limit error log size
        }
      }
    });

    return ffmpegProcess;
  }

  /**
   * ✅ Stop recording
   */
  async stopRecording(callId) {
    try {
      const recordingData = this.activeRecordings.get(callId.toString());
      if (!recordingData) {
        logger.warn(`No active recording found for call: ${callId}`);
        return null;
      }

      logger.callEvent('Stopping recording', {
        callId,
        recordingId: recordingData.recordingId,
        filePath: recordingData.filePath,
      });

      // Stop recording process
      if (recordingData.recordingProcess && !recordingData.recordingProcess.killed) {
        // Send SIGTERM first (graceful shutdown)
        recordingData.recordingProcess.kill('SIGTERM');
        
        // Wait for process to exit gracefully
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            // Force kill if still running after 5 seconds
            if (!recordingData.recordingProcess.killed) {
              logger.warn('FFmpeg did not exit gracefully, forcing kill');
              recordingData.recordingProcess.kill('SIGKILL');
            }
            resolve();
          }, 5000);
          
          recordingData.recordingProcess.on('exit', (code) => {
            clearTimeout(timeout);
            logger.debug(`FFmpeg process exited with code: ${code}`);
            resolve();
          });
        });
        
        // Give FFmpeg a moment to finish writing the file
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Close consumers
      for (const consumerData of recordingData.consumers) {
        try {
          const consumer = consumerData.consumer || consumerData;
          if (consumer && !consumer.closed) {
            consumer.close();
          }
        } catch (error) {
          logger.error(`Error closing consumer:`, error);
        }
      }

      // Close transport
      try {
        if (recordingData.plainTransport && !recordingData.plainTransport.closed) {
          recordingData.plainTransport.close();
        }
      } catch (error) {
        logger.error(`Error closing plain transport:`, error);
      }

      // Check if file exists and get size
      // Wait a bit more for file to be written (FFmpeg may need time to flush)
      let fileSize = 0;
      let fileExists = false;
      
      // Try multiple times to find the file (FFmpeg may still be writing)
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const stats = await fs.stat(recordingData.filePath);
          fileSize = stats.size;
          fileExists = true;
          logger.debug(`File found on attempt ${attempt + 1}, size: ${fileSize} bytes`);
          break;
        } catch (error) {
          if (attempt < 4) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            logger.warn(`File not found after 5 attempts: ${recordingData.filePath}`, error);
          }
        }
      }
      
      if (!fileExists) {
        logger.error(`Recording file was not created: ${recordingData.filePath}`);
        logger.error('This may indicate FFmpeg failed to receive RTP streams or encountered an error');
      }

      // ✅ Don't mark as completed here - let recordingService.stopRecording() handle it
      // This prevents "Recording not found" error when stopRecording is called after this
      
      // Clean up SDP file if it exists
      const sdpFilePath = recordingData.sdpFilePath || recordingData.recordingProcess?.sdpFilePath;
      if (sdpFilePath) {
        try {
          await fs.unlink(sdpFilePath);
          logger.debug('SDP file deleted:', sdpFilePath);
        } catch (error) {
          // Ignore if file doesn't exist
          if (error.code !== 'ENOENT') {
            logger.warn('Error deleting SDP file:', error);
          }
        }
      }
      
      // Remove from active recordings
      this.activeRecordings.delete(callId.toString());
      
      // Mark recording as completed (after removing from activeRecordings to avoid conflicts)
      if (fileSize > 0) {
        await recordingService.markRecordingCompleted(
          callId,
          recordingData.filePath,
          recordingData.fileUrl,
          fileSize
        );
      } else {
        await recordingService.markRecordingFailed(callId, new Error('Recording file is empty or not found'));
      }

      logger.callEvent('Recording stopped successfully', {
        callId,
        recordingId: recordingData.recordingId,
        filePath: recordingData.filePath,
        fileSize,
      });

      return {
        filePath: recordingData.filePath,
        fileUrl: recordingData.fileUrl,
        fileSize,
      };
    } catch (error) {
      logger.error('Error stopping recording:', error);
      throw error;
    }
  }

  /**
   * ✅ Get active recording
   */
  getActiveRecording(callId) {
    return this.activeRecordings.get(callId.toString());
  }

  /**
   * ✅ Check if recording is active
   */
  isRecording(callId) {
    return this.activeRecordings.has(callId.toString());
  }
}

// Export singleton instance
const recordingManager = new RecordingManager();
module.exports = recordingManager;

