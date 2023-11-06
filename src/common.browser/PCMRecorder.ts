// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { RiffPcmEncoder, Stream } from "../common/Exports";
import { IRecorder } from "./IRecorder";

export class PcmRecorder implements IRecorder {
    private privMediaResources: IMediaResources;
    private privSpeechProcessorScript: string; // speech-processor.js Url
    private privStopInputOnRelease: boolean;

    private privWorkletNode: AudioWorkletNode;
    private privRecordingStarted: number;

    public constructor(stopInputOnRelease: boolean) {
        this.privStopInputOnRelease = stopInputOnRelease;
    }

    public record(context: AudioContext, mediaStream: MediaStream, outputStream: Stream<ArrayBuffer>, firstBytesCB: () => void): void {
        const desiredSampleRate = 16000;

        const waveStreamEncoder = new RiffPcmEncoder(context.sampleRate, desiredSampleRate);

        const micInput = context.createMediaStreamSource(mediaStream);

        const attachScriptProcessor = (): void => {
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            const scriptNode = (() => {
                let bufferSize = 0;
                try {
                    return context.createScriptProcessor(bufferSize, 1, 1);
                } catch (error) {
                    // Webkit (<= version 31) requires a valid bufferSize.
                    bufferSize = 2048;
                    let audioSampleRate = context.sampleRate;
                    while (bufferSize < 16384 && audioSampleRate >= (2 * desiredSampleRate)) {
                        bufferSize <<= 1;
                        audioSampleRate >>= 1;
                    }
                    return context.createScriptProcessor(bufferSize, 1, 1);
                }
            })();
            scriptNode.onaudioprocess = (event: AudioProcessingEvent): void => {
                if (this.privRecordingStarted > 0) {
                    // eslint-disable-next-line no-console
                    console.log("Received first bytes....");
                    // eslint-disable-next-line no-console
                    console.log(new Date().getTime());
                    if (firstBytesCB != null) {
                        firstBytesCB();
                    }
                    this.privRecordingStarted = -1;
                }
                const inputFrame = event.inputBuffer.getChannelData(0);
                // eslint-disable-next-line no-console
                console.log("onaudioprocess");
                // eslint-disable-next-line no-console
                console.log(new Date().getTime());

                if (outputStream && !outputStream.isClosed) {
                    const waveFrame = waveStreamEncoder.encode(inputFrame);
                    if (!!waveFrame) {
                        outputStream.writeStreamChunk({
                            buffer: waveFrame,
                            isEnd: false,
                            timeReceived: Date.now(),
                        });
                        // eslint-disable-next-line no-console
                        console.log("onaudioprocess written");
                    }
                }
            };
            micInput.connect(scriptNode);
            scriptNode.connect(context.destination);
            this.privMediaResources = {
                scriptProcessorNode: scriptNode,
                source: micInput,
                stream: mediaStream,
            };
        };

        // https://webaudio.github.io/web-audio-api/#audioworklet
        // Using AudioWorklet to improve audio quality and avoid audio glitches due to blocking the UI thread
        const skipAudioWorklet = !!this.privSpeechProcessorScript && this.privSpeechProcessorScript.toLowerCase() === "ignore";
        this.privRecordingStarted = new Date().getTime();

        if (!!context.audioWorklet && !skipAudioWorklet) {
            if (!this.privSpeechProcessorScript) {
                const workletScript = `class SP extends AudioWorkletProcessor {
                    constructor(options) {
                      super(options);
                    }
                    process(inputs, outputs) {
                      const input = inputs[0];
                      const output = [];
                      for (let channel = 0; channel < input.length; channel += 1) {
                        output[channel] = input[channel];
                      }
                      this.port.postMessage(output[0]);
                      return true;
                    }
                  }
                  registerProcessor('speech-processor', SP);`;
                const blob = new Blob([workletScript], { type: "application/javascript; charset=utf-8" });
                this.privSpeechProcessorScript = URL.createObjectURL(blob);
                // eslint-disable-next-line no-console
                console.log("========+++??? register processor");
                // eslint-disable-next-line no-console
                console.log(new Date().getTime());
            }

            if (!!this.privWorkletNode) {
                // eslint-disable-next-line no-console
                console.log("========reuse worklet node:");
                // eslint-disable-next-line no-console
                console.log(new Date().getTime());
                this.privWorkletNode.port.onmessage = (ev: MessageEvent): void => {
                    /*
                    // eslint-disable-next-line no-console
                    console.log("onmessage");
                    // eslint-disable-next-line no-console
                    console.log(new Date().getTime());
                    //*/
                    if (this.privRecordingStarted > 0) {
                        // eslint-disable-next-line no-console
                        console.log("Received first bytes....");
                        // eslint-disable-next-line no-console
                        console.log(new Date().getTime());
                        if (firstBytesCB != null) {
                            firstBytesCB();
                        }
                        this.privRecordingStarted = -1;
                    }
                    const inputFrame: Float32Array = ev.data as Float32Array;

                    if (outputStream && !outputStream.isClosed) {
                        const waveFrame = waveStreamEncoder.encode(inputFrame);
                        if (!!waveFrame) {
                            outputStream.writeStreamChunk({
                                buffer: waveFrame,
                                isEnd: false,
                                timeReceived: Date.now(),
                            });
                            /*
                            // eslint-disable-next-line no-console
                            console.log("onmessage written");
                            //*/
                        }
                    }
                };
                micInput.connect(this.privWorkletNode);
                this.privWorkletNode.connect(context.destination);
                // eslint-disable-next-line no-console
                console.log(new Date().getTime());
                this.privMediaResources = {
                    scriptProcessorNode: this.privWorkletNode,
                    source: micInput,
                    stream: mediaStream,
                };
                return;
            }
            // eslint-disable-next-line no-console
            console.log("========++++++ add processor script");
            // eslint-disable-next-line no-console
            console.log(new Date().getTime());
            context.audioWorklet
                .addModule(this.privSpeechProcessorScript)
                .then((): void => {
                    // eslint-disable-next-line no-console
                    console.log("========+++--- added processor script");
                    // eslint-disable-next-line no-console
                    console.log(new Date().getTime());
                    const workletNode = new AudioWorkletNode(context, "speech-processor");
                    // eslint-disable-next-line no-console
                    console.log(new Date().getTime());
                    workletNode.port.onmessage = (ev: MessageEvent): void => {
                        /*
                        // eslint-disable-next-line no-console
                        console.log("onmessage");
                        // eslint-disable-next-line no-console
                        console.log(new Date().getTime());
                        //*/
                        if (this.privRecordingStarted > 0) {
                            // eslint-disable-next-line no-console
                            console.log("Received first bytes....");
                            // eslint-disable-next-line no-console
                            console.log(new Date().getTime());
                            if (firstBytesCB != null) {
                                firstBytesCB();
                            }
                            this.privRecordingStarted = -1;
                        }
                        const inputFrame: Float32Array = ev.data as Float32Array;

                        if (outputStream && !outputStream.isClosed) {
                            const waveFrame = waveStreamEncoder.encode(inputFrame);
                            if (!!waveFrame) {
                                outputStream.writeStreamChunk({
                                    buffer: waveFrame,
                                    isEnd: false,
                                    timeReceived: Date.now(),
                                });
                                /*
                                // eslint-disable-next-line no-console
                                console.log("onmessage written");
                                //*/
                            }
                        }
                    };
                    micInput.connect(workletNode);
                    workletNode.connect(context.destination);
                    this.privWorkletNode = workletNode;
                    // eslint-disable-next-line no-console
                    console.log(new Date().getTime());
                    this.privMediaResources = {
                        scriptProcessorNode: workletNode,
                        source: micInput,
                        stream: mediaStream,
                    };
                })
                .catch((): void => {
                    attachScriptProcessor();
                });
        } else {
            try {
                attachScriptProcessor();
            } catch (err) {
                throw new Error(`Unable to start audio worklet node for PCMRecorder: ${err as string}`);
            }
        }
    }

    public releaseMediaResources(context: AudioContext): void {
        if (this.privMediaResources) {
            if (this.privMediaResources.scriptProcessorNode) {
                this.privMediaResources.scriptProcessorNode.disconnect(context.destination);
                this.privMediaResources.scriptProcessorNode = null;
            }
            if (this.privMediaResources.source) {
                this.privMediaResources.source.disconnect();
                if (this.privStopInputOnRelease) {
                    this.privMediaResources.stream.getTracks().forEach((track: MediaStreamTrack): void => track.stop());
                }
                this.privMediaResources.source = null;
            }
        }
    }

    public setWorkletUrl(url: string): void {
        this.privSpeechProcessorScript = url;
    }
}

interface IMediaResources {
    source: MediaStreamAudioSourceNode;
    scriptProcessorNode: ScriptProcessorNode | AudioWorkletNode;
    stream: MediaStream;
}
