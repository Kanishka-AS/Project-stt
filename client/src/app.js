import { PipecatClient } from '@pipecat-ai/client-js';
import {
  AVAILABLE_TRANSPORTS,
  DEFAULT_TRANSPORT,
  TRANSPORT_CONFIG,
  createTransport,
} from './config';

class SpeechToTextClient {
  constructor() {
    this.client = null;
    this.transportType = DEFAULT_TRANSPORT;
    this.isConnected = false;
    this.interimLine = null;

    this.setupDOM();
    this.setupEventListeners();
    this.addEvent('initialized', 'Client initialized');
  }

  setupDOM() {
    this.transportSelect = document.getElementById('transport-select');
    this.connectBtn = document.getElementById('connect-btn');
    this.micBtn = document.getElementById('mic-btn');
    this.micStatus = document.getElementById('mic-status');
    this.transcriptLog = document.getElementById('transcript-log');
    this.eventsLog = document.getElementById('events-log');

    // Populate transport selector with available transports
    this.transportSelect.innerHTML = '';
    AVAILABLE_TRANSPORTS.forEach((transport) => {
      const option = document.createElement('option');
      option.value = transport;
      option.textContent =
        transport.charAt(0).toUpperCase() + transport.slice(1);
      if (transport === 'smallwebrtc') {
        option.textContent = 'SmallWebRTC';
      } else if (transport === 'daily') {
        option.textContent = 'Daily';
      } else if (transport === 'websocket') {
        option.textContent = 'WebSocket';
      }
      this.transportSelect.appendChild(option);
    });

    // Hide transport selector if only one transport
    if (AVAILABLE_TRANSPORTS.length === 1) {
      this.transportSelect.parentElement.style.display = 'none';
    }

    // Add placeholder message
    this.addPlaceholder('Connect and start talking to see live transcription');
  }

  setupEventListeners() {
    this.transportSelect.addEventListener('change', (e) => {
      this.transportType = e.target.value;
      this.addEvent('transport-changed', this.transportType);
    });

    this.connectBtn.addEventListener('click', () => {
      if (this.isConnected) {
        this.disconnect();
      } else {
        this.connect();
      }
    });

    this.micBtn.addEventListener('click', () => {
      if (this.client) {
        const newState = !this.client.isMicEnabled;
        this.client.enableMic(newState);
        this.updateMicButton(newState);
      }
    });
  }

  async connect() {
    try {
      this.addEvent('connecting', `Using ${this.transportType} transport`);

      // Create transport using config
      const transport = await createTransport(this.transportType);

      // Create client
      this.client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            this.onConnected();
          },
          onDisconnected: () => {
            this.onDisconnected();
          },
          onTransportStateChanged: (state) => {
            this.addEvent('transport-state', state);
          },
          onBotReady: () => {
            this.addEvent('bot-ready', 'Speech-to-text pipeline is ready');
          },
          onUserTranscript: (data) => {
            if (data.final) {
              this.addFinalTranscript(data.text);
            } else {
              this.updateInterimTranscript(data.text);
            }
          },
          onError: (error) => {
            this.addEvent('error', error.message);
          },
        },
      });

      // Start bot and connect using config
      const connectParams = TRANSPORT_CONFIG[this.transportType];
      if (this.transportType === 'websocket') {
        // WebSocket connects in two steps: start the bot to obtain the
        // WebSocket URL (and optional token), then connect to it.
        const { wsUrl, token } = await this.client.startBot(connectParams);
        await this.client.connect({
          wsUrl: token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl,
        });
      } else {
        await this.client.startBotAndConnect(connectParams);
      }
    } catch (error) {
      this.addEvent('error', error.message);
      console.error('Connection error:', error);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  onConnected() {
    this.isConnected = true;
    this.connectBtn.textContent = 'Disconnect';
    this.connectBtn.classList.add('disconnect');
    this.micBtn.disabled = false;
    this.transportSelect.disabled = true;
    this.updateMicButton(this.client.isMicEnabled);
    this.addEvent('connected', 'Successfully connected to bot');

    // Clear placeholder
    if (this.transcriptLog.querySelector('.placeholder')) {
      this.transcriptLog.innerHTML = '';
    }
  }

  onDisconnected() {
    this.isConnected = false;
    this.connectBtn.textContent = 'Connect';
    this.connectBtn.classList.remove('disconnect');
    this.micBtn.disabled = true;
    this.transportSelect.disabled = false;
    this.updateMicButton(false);
    this.interimLine = null;
    this.addEvent('disconnected', 'Disconnected from bot');
  }

  updateMicButton(enabled) {
    this.micStatus.textContent = enabled ? 'Mic is On' : 'Mic is Off';
    this.micBtn.style.backgroundColor = enabled ? '#10b981' : '#1f2937';
  }

  addPlaceholder(text) {
    const div = document.createElement('div');
    div.className = 'transcript-line placeholder';
    div.textContent = text;
    this.transcriptLog.appendChild(div);
  }

  // Final transcripts accumulate as separate lines in the log.
  addFinalTranscript(text) {
    // Remove any live interim line — it's been finalized.
    if (this.interimLine) {
      this.interimLine.remove();
      this.interimLine = null;
    }

    const div = document.createElement('div');
    div.className = 'transcript-line final';
    div.textContent = text;
    this.transcriptLog.appendChild(div);
    this.transcriptLog.scrollTop = this.transcriptLog.scrollHeight;
  }

  // Interim transcripts update a single "live" line in place, showing the
  // STT engine's best guess so far while the user is still speaking.
  updateInterimTranscript(text) {
    if (!this.interimLine) {
      this.interimLine = document.createElement('div');
      this.interimLine.className = 'transcript-line interim';
      this.transcriptLog.appendChild(this.interimLine);
    }
    this.interimLine.textContent = text;
    this.transcriptLog.scrollTop = this.transcriptLog.scrollHeight;
  }

  addEvent(eventName, data) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event-entry';

    const timestamp = new Date().toLocaleTimeString();
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = timestamp;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'event-name';
    nameSpan.textContent = eventName;

    const dataSpan = document.createElement('span');
    dataSpan.className = 'event-data';
    dataSpan.textContent =
      typeof data === 'string' ? data : JSON.stringify(data);

    eventDiv.appendChild(timestampSpan);
    eventDiv.appendChild(nameSpan);
    eventDiv.appendChild(dataSpan);

    this.eventsLog.appendChild(eventDiv);
    this.eventsLog.scrollTop = this.eventsLog.scrollHeight;
  }
}

// Initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new SpeechToTextClient();
});
