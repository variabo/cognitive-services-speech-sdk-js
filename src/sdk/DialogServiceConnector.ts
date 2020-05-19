// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DialogConnectionFactory } from "../common.speech/DialogConnectorFactory";
import {
    DialogServiceAdapter,
    IAgentConfig,
    IAuthentication,
    IConnectionFactory,
    RecognitionMode,
    RecognizerConfig,
    ServiceRecognizerBase,
    SpeechServiceConfig,
} from "../common.speech/Exports";
import { ActivityReceivedEventArgs } from "./ActivityReceivedEventArgs";
import { AudioConfigImpl } from "./Audio/AudioConfig";
import { Contracts } from "./Contracts";
import { DialogServiceConfig, DialogServiceConfigImpl } from "./DialogServiceConfig";
import {
    AudioConfig,
    PropertyCollection,
    Recognizer,
    SpeechRecognitionCanceledEventArgs,
    SpeechRecognitionEventArgs,
    SpeechRecognitionResult
} from "./Exports";
import { PropertyId } from "./PropertyId";

/**
 * Dialog Service Connector
 * @class DialogServiceConnector
 */
export class DialogServiceConnector extends Recognizer {
    private privIsDisposed: boolean;
    private isTurnComplete: boolean;

    /**
     * Initializes an instance of the DialogServiceConnector.
     * @constructor
     * @param {DialogServiceConfig} dialogConfig - Set of properties to configure this recognizer.
     * @param {AudioConfig} audioConfig - An optional audio config associated with the recognizer
     */
    public constructor(dialogConfig: DialogServiceConfig, audioConfig?: AudioConfig) {
        const dialogServiceConfigImpl = dialogConfig as DialogServiceConfigImpl;
        Contracts.throwIfNull(dialogConfig, "dialogConfig");

        super(audioConfig, dialogServiceConfigImpl.properties, new DialogConnectionFactory());

        this.isTurnComplete = true;
        this.privIsDisposed = false;
        this.privProperties = dialogServiceConfigImpl.properties.clone();

        const agentConfig = this.buildAgentConfig();
        this.privReco.agentConfig.set(agentConfig);
    }

    /**
     * The event recognizing signals that an intermediate recognition result is received.
     * @member DialogServiceConnector.prototype.recognizing
     * @function
     * @public
     */
    public recognizing: (sender: DialogServiceConnector, event: SpeechRecognitionEventArgs) => void;

    /**
     * The event recognized signals that a final recognition result is received.
     * @member DialogServiceConfig.prototype.recognized
     * @function
     * @public
     */
    public recognized: (sender: DialogServiceConnector, event: SpeechRecognitionEventArgs) => void;

    /**
     * The event canceled signals that an error occurred during recognition.
     * @member DialogServiceConnector.prototype.canceled
     * @function
     * @public
     */
    public canceled: (sender: DialogServiceConnector, event: SpeechRecognitionCanceledEventArgs) => void;

    /**
     * The event activityReceived signals that an activity has been received.
     * @member DialogServiceConnector.prototype.activityReceived
     * @function
     * @public
     */
    public activityReceived: (sender: DialogServiceConnector, event: ActivityReceivedEventArgs) => void;

    /**
     * Starts a connection to the service.
     * Users can optionally call connect() to manually set up a connection in advance, before starting interactions.
     *
     * Note: On return, the connection might not be ready yet. Please subscribe to the Connected event to
     * be notified when the connection is established.
     * @member DialogServiceConnector.prototype.connect
     * @function
     * @public
     */
    public async connect(): Promise<void> {
        return await this.privReco.connect();
    }

    /**
     * Closes the connection the service.
     * Users can optionally call disconnect() to manually shutdown the connection of the associated DialogServiceConnector.
     *
     * If disconnect() is called during a recognition, recognition will fail and cancel with an error.
     */
    public disconnect(cb?: () => void, err?: (error: string) => void): void {
        this.privReco.disconnect().then(() => {
            if (!!cb) {
                cb();
            }
        }, (error: string) => {
            if (!!err) {
                err(error);
            }
        });
    }

    /**
     * Gets the authorization token used to communicate with the service.
     * @member DialogServiceConnector.prototype.authorizationToken
     * @function
     * @public
     * @returns {string} Authorization token.
     */
    public get authorizationToken(): string {
        return this.properties.getProperty(PropertyId.SpeechServiceAuthorization_Token);
    }

    /**
     * Sets the authorization token used to communicate with the service.
     * @member DialogServiceConnector.prototype.authorizationToken
     * @function
     * @public
     * @param {string} token - Authorization token.
     */
    public set authorizationToken(token: string) {
        Contracts.throwIfNullOrWhitespace(token, "token");
        this.properties.setProperty(PropertyId.SpeechServiceAuthorization_Token, token);
    }

    /**
     * The collection of properties and their values defined for this DialogServiceConnector.
     * @member DialogServiceConnector.prototype.properties
     * @function
     * @public
     * @returns {PropertyCollection} The collection of properties and their values defined for this DialogServiceConnector.
     */
    public get properties(): PropertyCollection {
        return this.privProperties;
    }

    /** Gets the template for the activity generated by service from speech.
     * Properties from the template will be stamped on the generated activity.
     * It can be empty
     */
    public get speechActivityTemplate(): string {
        return this.properties.getProperty(PropertyId.Conversation_Speech_Activity_Template);
    }

    /** Sets the template for the activity generated by service from speech.
     * Properties from the template will be stamped on the generated activity.
     * It can be null or empty.
     * Note: it has to be a valid Json object.
     */
    public set speechActivityTemplate(speechActivityTemplate: string) {
        this.properties.setProperty(PropertyId.Conversation_Speech_Activity_Template, speechActivityTemplate);
    }

    /**
     * Starts recognition and stops after the first utterance is recognized.
     * @member DialogServiceConnector.prototype.listenOnceAsync
     * @function
     * @public
     * @param cb - Callback that received the result when the reco has completed.
     * @param err - Callback invoked in case of an error.
     */
    public listenOnceAsync(cb?: (e: SpeechRecognitionResult) => void, err?: (e: string) => void): void {
        if (this.isTurnComplete) {
            try {
                Contracts.throwIfDisposed(this.privIsDisposed);
                const foo = async () => {
                    try {
                        await this.connect();

                        await this.implRecognizerStop();
                        this.isTurnComplete = false;

                        await this.privReco.recognize(
                            RecognitionMode.Conversation,
                            (e: SpeechRecognitionResult) => {
                                this.implRecognizerStop().then(() => {
                                    this.isTurnComplete = true;

                                    if (!!cb) {
                                        cb(e);
                                    }
                                }, (error: string) => {
                                    if (!!err) {
                                        err(error);
                                    }
                                });
                            },
                            (e: string) => {
                                this.implRecognizerStop().catch();
                                this.isTurnComplete = true;
                                if (!!err) {
                                    err(e);
                                }
                                /* tslint:disable:no-empty */
                            });
                    } catch (error) {
                        if (!!err) {
                            err(error);
                        }
                    }
                };
                foo().catch();
            } catch (error) {
                if (!!err) {
                    if (error instanceof Error) {
                        const typedError: Error = error as Error;
                        err(typedError.name + ": " + typedError.message);
                    } else {
                        err(error);
                    }
                }

                // Destroy the recognizer.
                this.dispose(true).catch();
            }
        }
    }

    public sendActivityAsync(activity: string, cb?: () => void, errCb?: (error: string) => void): void {
        (this.privReco as DialogServiceAdapter).sendMessage(activity).then(() => {
            if (!!cb) {
                try { cb(); } catch (error) { }
            }
        }, (error: string) => {
            if (!!errCb) {
                try { errCb(error); } catch (error2) { }
            }
        });
    }

    /**
     * closes all external resources held by an instance of this class.
     * @member DialogServiceConnector.prototype.close
     * @function
     * @public
     */
    public async close(): Promise<void> {
        Contracts.throwIfDisposed(this.privIsDisposed);

        await this.dispose(true);
    }

    protected async dispose(disposing: boolean): Promise<void> {
        if (this.privIsDisposed) {
            return;
        }

        if (disposing) {
            this.privIsDisposed = true;
            await this.implRecognizerStop();
            await super.dispose(disposing);
        }
    }

    protected createRecognizerConfig(speechConfig: SpeechServiceConfig): RecognizerConfig {
        return new RecognizerConfig(speechConfig, this.privProperties);
    }

    protected createServiceRecognizer(
        authentication: IAuthentication,
        connectionFactory: IConnectionFactory,
        audioConfig: AudioConfig,
        recognizerConfig: RecognizerConfig): ServiceRecognizerBase {

        const audioSource: AudioConfigImpl = audioConfig as AudioConfigImpl;

        return new DialogServiceAdapter(authentication, connectionFactory, audioSource, recognizerConfig, this);
    }

    private buildAgentConfig(): IAgentConfig {
        const communicationType = this.properties.getProperty("Conversation_Communication_Type", "Default");

        return {
            botInfo: {
                commType: communicationType,
                commandsCulture: undefined,
                connectionId: this.properties.getProperty(PropertyId.Conversation_ApplicationId),
                conversationId: undefined,
                fromId: this.properties.getProperty(PropertyId.Conversation_From_Id, undefined)
            },
            version: 0.2
        };
    }
}
