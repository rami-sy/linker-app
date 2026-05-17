const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const recordingService = require("./recording.service");

class PuppeteerRecordingService {
  constructor() {
    this.activeRecordings = new Map(); // Map<callId, { browser, page, stream, filePath }>
    this.recordingPath =
      process.env.RECORDING_PATH || path.join(__dirname, "../../recordings");
    // Client URL for the recorder page
    // Assuming client is running on localhost:8081 (Expo default) or configured URL
    this.clientUrl = process.env.CLIENT_URL || "http://localhost:8081";
  }

  /**
   * Start recording a call
   * @param {string} roomId - The room ID to join
   * @param {string} callId - The call ID for the recording
   * @param {object} recordingInfo - Additional info
   */
  async startRecording(roomId, callId, recordingInfo = {}) {
    try {
      if (this.activeRecordings.has(callId.toString())) {
        logger.warn(`Recording already in progress for call: ${callId}`);
        return this.activeRecordings.get(callId.toString());
      }

      logger.info(
        `Starting Puppeteer recording for room ${roomId}, call ${callId}`
      );

      // 1. Launch Browser
      const executablePath =
        process.env.CHROME_PATH || puppeteer.executablePath();
      logger.info(`Launching Puppeteer with executable: ${executablePath}`);

      // Launch browser with necessary permissions
      const browser = await puppeteer.launch({
        executablePath,
        headless: false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--start-maximized",
          "--autoplay-policy=no-user-gesture-required",
          "--use-fake-ui-for-media-stream", // Auto-accept getDisplayMedia prompts
          "--use-fake-device-for-media-stream", // Use fake devices for testing
        ],
        defaultViewport: null,
      });

      const page = await browser.newPage();

      // 2. Navigate to Recorder Page
      // We pass a special query param or route to indicate this is a recorder
      // e.g., /call-recorder/[roomId]
      const recorderUrl = `${
        this.clientUrl
      }/call-recorder/${roomId}?isRecorder=true&token=${
        recordingInfo.token || ""
      }`;

      logger.debug(`Navigating to ${recorderUrl}`);

      await page.goto(recorderUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Capture browser console logs
      page.on("console", (msg) => {
        logger.debug(`[Browser Console] ${msg.type()}: ${msg.text()}`);
      });

      // Capture browser errors
      page.on("pageerror", (err) => {
        logger.error(`[Browser Error] ${err.toString()}`);
      });

      // 3. Wait for page to load and MediaSoup to initialize
      // Wait for the call to actually start rendering
      logger.info("Waiting for page to fully load and MediaSoup to initialize...");
      
      // Wait for MediaSoup call component to be ready
      try {
        await page.waitForFunction(
          () => {
            // Check if MediasoupCall component is rendered and has video elements
            const videos = document.querySelectorAll('video');
            const hasActiveVideo = Array.from(videos).some(v => 
              v.readyState >= 2 && (v.videoWidth > 0 || v.videoHeight > 0)
            );
            return hasActiveVideo || document.querySelector('canvas') !== null;
          },
          { timeout: 30000, polling: 500 }
        );
        logger.info("MediaSoup call component found and video streams are active");
      } catch (error) {
        logger.warn("MediaSoup call component not found or video not ready, proceeding anyway...");
      }

      // Additional wait to ensure everything is fully loaded
      await new Promise((resolve) => setTimeout(resolve, 5000));
      
      logger.info("Page loaded, starting screencast...");

      // Prepare file path (will be MP4 after FFmpeg conversion)
      const fileName = `recording_${
        recordingInfo.recordingId
      }_${Date.now()}.mp4`;
      const filePath = path.join(this.recordingPath, fileName);
      const fileUrl = `/recordings/${fileName}`;

      // 4. Use CDP (Chrome DevTools Protocol) to capture screen
      // This is more reliable than getDisplayMedia for automated recording
      const client = await page.target().createCDPSession();
      
      // Start screen capture using CDP
      // Note: CDP screencast only supports 'png' or 'jpeg' format, not 'webm'
      // We'll use 'png' and convert frames to video later, or use a different approach
      await client.send('Page.startScreencast', {
        format: 'png', // CDP only supports png or jpeg
        quality: 90, // Higher quality
        maxWidth: 1920, // Higher resolution to capture full screen
        maxHeight: 1080,
      });
      
      logger.info('Screencast started, waiting for frames...');

      // Create file stream to save recording
      // Note: CDP screencast gives PNG frames, we'll need to convert to video
      // For now, we'll save frames and use FFmpeg to convert later, or use a different approach
      const framesDir = path.join(this.recordingPath, `frames_${recordingInfo.recordingId}_${Date.now()}`);
      await fs.promises.mkdir(framesDir, { recursive: true });
      let frameCount = 0;
      
      // Listen for screencast frames
      let lastFrameTime = Date.now();
      client.on('Page.screencastFrame', async ({ data, sessionId }) => {
        try {
          // Decode base64 PNG data and save as individual frame
          const buffer = Buffer.from(data, 'base64');
          const framePath = path.join(framesDir, `frame_${String(frameCount).padStart(6, '0')}.png`);
          await fs.promises.writeFile(framePath, buffer);
          
          const now = Date.now();
          const timeSinceLastFrame = now - lastFrameTime;
          lastFrameTime = now;
          
          // Log every 30 frames to avoid spam
          if (frameCount % 30 === 0) {
            logger.debug(`Captured ${frameCount} frames (last frame interval: ${timeSinceLastFrame}ms)`);
          }
          
          frameCount++;
          
          // Acknowledge frame immediately to keep receiving frames
          await client.send('Page.screencastFrameAck', { sessionId });
        } catch (error) {
          logger.error('Error saving screencast frame:', error);
        }
      });
      
      // Store frames directory for later conversion
      const fileStream = {
        write: () => {},
        end: () => {},
        destroy: () => {},
        framesDir, // Store for later FFmpeg conversion
        frameCount: () => frameCount,
      };

      // Create a stream-like object for compatibility
      const stream = {
        on: () => {},
        pipe: () => {},
        destroy: async () => {
          // Stop screencast
          try {
            await client.send('Page.stopScreencast');
            fileStream.end();
          } catch (error) {
            logger.error('Error stopping screencast:', error);
          }
        },
      };

      // Store recording state
      const recordingData = {
        callId: callId.toString(),
        recordingId: recordingInfo.recordingId,
        browser,
        page,
        client, // CDP client for screencast
        stream,
        fileStream,
        filePath,
        fileUrl,
        startedAt: Date.now(),
      };

      this.activeRecordings.set(callId.toString(), recordingData);

      logger.callEvent("Puppeteer recording started successfully", {
        callId,
        recordingId: recordingInfo.recordingId,
        filePath,
      });

      // Handle stream end or error
      stream.on("end", () => {
        logger.info(`Stream ended for call ${callId}`);
        this.stopRecording(callId).catch((err) =>
          logger.error("Error stopping recording on stream end:", err)
        );
      });

      return recordingData;
    } catch (error) {
      logger.error("Error starting Puppeteer recording:", error);
      throw error;
    }
  }

  /**
   * Check if recording is active for a call
   * @param {string} callId
   * @returns {boolean}
   */
  isRecording(callId) {
    return this.activeRecordings.has(callId.toString());
  }

  /**
   * Stop recording
   * @param {string} callId
   */
  async stopRecording(callId) {
    try {
      const recordingData = this.activeRecordings.get(callId.toString());
      if (!recordingData) {
        logger.warn(`No active recording found for call: ${callId}`);
        return null;
      }

      logger.info(`Stopping Puppeteer recording for call ${callId}`);

      // 1. Stop screencast and close CDP client
      if (recordingData.client) {
        try {
          await recordingData.client.send('Page.stopScreencast');
        } catch (error) {
          logger.error('Error stopping screencast:', error);
        }
      }

      // 2. Close File Stream
      if (recordingData.fileStream) {
        recordingData.fileStream.end();
      }

      // 3. Close Browser
      if (recordingData.browser) {
        await recordingData.browser.close();
      }

      // Wait a bit for screencast to stop and frames to be saved
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 3. Convert PNG frames to video using FFmpeg
      const { spawn } = require('child_process');
      const framesDir = recordingData.fileStream.framesDir;
      const frameCount = recordingData.fileStream.frameCount();
      const fps = recordingData.fileStream.fps || 30;
      
      if (frameCount > 0 && framesDir) {
        try {
          logger.info(`Converting ${frameCount} frames to video using FFmpeg`);
          
          // Use FFmpeg to convert PNG frames to MP4
          const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
          
          // Check if FFmpeg exists
          try {
            const { execSync } = require('child_process');
            execSync(`${ffmpegPath} -version`, { stdio: 'ignore' });
          } catch (error) {
            logger.error('FFmpeg not found. Please install FFmpeg.');
            throw new Error('FFmpeg not found. Please install FFmpeg.');
          }
          
          const ffmpegArgs = [
            '-y', // Overwrite output
            '-framerate', fps.toString(),
            '-i', path.join(framesDir, 'frame_%06d.png'),
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-r', fps.toString(),
            '-movflags', '+faststart', // Enable fast start for web playback
            recordingData.filePath,
          ];
          
          logger.debug(`FFmpeg command: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);
          
          await new Promise((resolve, reject) => {
            const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
              stdio: ['ignore', 'pipe', 'pipe'],
              shell: false,
            });
            
            let ffmpegOutput = '';
            let ffmpegErrors = '';
            
            ffmpegProcess.stdout.on('data', (data) => {
              ffmpegOutput += data.toString();
            });
            
            ffmpegProcess.stderr.on('data', (data) => {
              const output = data.toString();
              ffmpegErrors += output;
              // FFmpeg writes progress to stderr, so log it as debug
              if (output.includes('frame=') || output.includes('time=')) {
                logger.debug(`FFmpeg: ${output.trim()}`);
              }
            });
            
            ffmpegProcess.on('error', (error) => {
              logger.error(`FFmpeg process error: ${error.message}`);
              reject(error);
            });
            
            ffmpegProcess.on('exit', (code, signal) => {
              if (code === 0) {
                logger.info('FFmpeg conversion completed successfully');
                resolve();
              } else {
                const errorMsg = `FFmpeg conversion failed with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
                logger.error(`${errorMsg}\nFFmpeg stderr: ${ffmpegErrors.substring(0, 1000)}`);
                reject(new Error(errorMsg));
              }
            });
          });
          
          // Clean up frames directory
          try {
            await fs.promises.rm(framesDir, { recursive: true, force: true });
            logger.debug(`Cleaned up frames directory: ${framesDir}`);
          } catch (error) {
            logger.warn(`Error cleaning up frames directory: ${error.message}`);
          }
        } catch (error) {
          logger.error('Error converting frames to video:', error);
          // Continue even if conversion fails
        }
      }

      // 4. Get File Stats
      let fileSize = 0;
      try {
        const stats = await fs.promises.stat(recordingData.filePath);
        fileSize = stats.size;
      } catch (e) {
        logger.error("Error getting recording file stats:", e);
      }

      // 4. Cleanup Map
      this.activeRecordings.delete(callId.toString());

      // 5. Mark Completed in DB
      if (fileSize > 0) {
        await recordingService.markRecordingCompleted(
          callId,
          recordingData.filePath,
          recordingData.fileUrl,
          fileSize
        );
      } else {
        await recordingService.markRecordingFailed(
          callId,
          new Error("Recording file is empty")
        );
      }

      logger.callEvent("Puppeteer recording stopped successfully", {
        callId,
        fileSize,
      });

      return {
        filePath: recordingData.filePath,
        fileUrl: recordingData.fileUrl,
        fileSize,
      };
    } catch (error) {
      logger.error("Error stopping Puppeteer recording:", error);
      throw error;
    }
  }
}

const puppeteerRecordingService = new PuppeteerRecordingService();
module.exports = puppeteerRecordingService;
