import { useSingleFileAuthState } from "./../utils/authState";
import makeWASocket, {
  AnyMessageContent,
  AuthenticationState,
  Chat,
  ConnectionState,
  Contact,
  DisconnectReason,
  DownloadableMessage,
  downloadContentFromMessage,
  proto,
  SocketConfig,
  WAMessage,
} from "@adiwajshing/baileys";
import { Boom } from "@hapi/boom";
import { BadRequest, Forbidden, NotFound } from "@tsed/exceptions";
import { PlatformMulterFile } from "@tsed/common";
import * as Pusher from "pusher";
import * as dotenv from "dotenv";

import https from "https"; // Added by Raj
import axios from "axios";

import * as QRCode from "qrcode";
import { unlinkSync } from "fs";
import {
  Button,
  ButtonMessage,
  ButtonMessageWithImage,
  LocationMessage,
  SendListMessageData,
  SendVCardData,
} from "../models/SendMessge";
import { getEnv } from "../utils/processEnv";

import PinoLogger from "pino";
import { v4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import { $log } from "ts-log-debug";

dotenv.config();

const env = getEnv();

export interface ChatWithMessages extends Chat {
  messages?: proto.IWebMessageInfo[];
  id: string;
}

export interface Instance {
  socket?: ReturnType<typeof makeWASocket>;
  key: string;
  connectionState?: string;
  qrCode?: string;
  chats: ChatWithMessages[];
  contacts: Contact[];
  messages: WAMessage[];
  hasReceivedMessages: boolean;
  hasReceivedChats: boolean;
  qrcodeCount: number;
}

export type chats_whatsapp = {
  id: number
  jid: string
  fromMe: boolean
  messageId: string
  pushName: string
  message: string | proto.IMessage
  reference: string
  instance: string
}

export class WhatsAppInstance {
  // Instance key of  Instance
  public key: string = "";
  public authState: { state: AuthenticationState; saveState: () => void };
  private disableWebhook = false;

  public secondaryWebhookUrl = "";
  public sendSecondaryWebhookMessage: boolean = false;

  private axiosClient = axios.create({
    baseURL: env.WEBOOK_BASE_URL,
    httpsAgent: env.WEBOOK_SSL_VERIFY
      ? new https.Agent({
        rejectUnauthorized: env.WEBOOK_SSL_VERIFY,
      })
      : undefined,
  });

  private secondaryWebhookClient = axios.create({
    baseURL: this.secondaryWebhookUrl,
  });

  async sendWebhookMessage(data: any) {
    if (this.sendSecondaryWebhookMessage) {
      this.secondaryWebhookClient.post("", data).catch((e) => {
        return;
      });
    }

    if (env.DISABLE_WEBHOOK) {
      return;
    }

    if (this.disableWebhook) {
      return;
    }

    this.axiosClient.post("", data).catch((e) => {
      return;
    });
  }

  public updateWebhookData(data: { url?: string; sendMessage?: boolean }) {
    if (data.sendMessage !== undefined) {
      this.sendSecondaryWebhookMessage = data.sendMessage;
    }
    if (data.url) {
      this.secondaryWebhookUrl = data.url;
      this.secondaryWebhookClient = axios.create({
        baseURL: data.url,
      });
    }

    return {
      url: this.secondaryWebhookUrl,
      sendMessage: this.sendSecondaryWebhookMessage,
    };
  }

  private pusherInstance = new Pusher.default({
    appId: env.PUSHER_APP_ID,
    key: env.PUSHER_KEY,
    secret: env.PUSHER_SECRET,
    cluster: env.PUSHER_CLUSTER,
    useTLS: true,
  });

  // Socket config used to configure the WhatsApp socket
  private socketConfig: Partial<SocketConfig> = {
    printQRInTerminal: false,

    browser: [env.BROWSER_CLIENT, env.BROWSER_NAME, "10.0"],
    logger: PinoLogger({
      level: "silent",
    }),
  };

  // Instance object with socket, key and connection state
  public instance: Instance = {
    key: this.key,
    chats: [],
    contacts: [],
    messages: [],
    hasReceivedMessages: false,
    hasReceivedChats: false,
    qrcodeCount: 0,
  };

  constructor(
    key?: string,
    private readonly prismaClient?: PrismaClient,
    disableWebhook = false, 
  ) {
    // Check if user has provided a key. If not use random uuid
    this.key = key ? key : v4();
    this.disableWebhook = disableWebhook;
    this.authState = useSingleFileAuthState(`./instances/${this.key}.json`);
  }

  // Method to start the WhatsApp handlers and connect to WhatsApp
  connect(): WhatsAppInstance {
    this.socketConfig.auth = this.authState.state;
    this.instance.socket = makeWASocket(this.socketConfig);
    this.setHandlers();
    return this;
  }

  // Method to remove part after ":" in the jid
  makeUserId = (jid: string) => {
    return jid.split(":")[0] + "@s.whatsapp.net";
  };

  // Method to push msg to its corresponding chat
  pushMessage = (message: WAMessage) => {
    const chat = this.instance.chats.find(
      (chat) => chat.id === message.key.remoteJid && !message.key.fromMe
    );

    if (chat) {
      chat.messages?.push(message);
    }
  };

  getSelf() {
    return {
      key: this.key,
      user: this.instance.socket?.user,
      connectionState: this.instance.connectionState,
    };
  }

  // Method to get msgs from specific chat
  getMessages = (chatId: string) => {
    return this.instance.messages.filter(
      (message) => message.key.remoteJid === chatId
    );
  };

  // Handlers for the WhatsApp events
  setHandlers() {
    // Current socket
    const socket = this.instance.socket;

    // listen for when the auth credentials is updated
    socket?.ev.on("creds.update", this.authState.saveState);

    // Handle initial receiving of the chats
    socket?.ev.on("chats.set", ({ chats }) => {
      const chatsWithMessages = chats.map((chat) => {
        return {
          ...chat,
          messages: [],
        };
      });

      this.instance.chats.push(...chatsWithMessages);
    });

    // Handle new Chats
    socket?.ev.on("chats.upsert", (chats) => {
      const chatsWithMessages = chats.map((chat) => {
        return {
          ...chat,
          messages: [],
        };
      });

      this.instance.chats.push(...chatsWithMessages);
    });

    // Handle chat updates like name change, bla bla bla
    socket?.ev.on("chats.update", (chats) => {
      chats.map((chat) => {
        const index = this.instance.chats.findIndex((c) => c.id === chat.id);
        const orgChat = this.instance.chats[index];
        this.instance.chats[index] = {
          ...orgChat,
          ...chat,
        };
      });
    });

    // Handle chat deletes
    socket?.ev.on("chats.delete", (chats) => {
      chats.map((chat) => {
        const index = this.instance.chats.findIndex((c) => c.id === chat);
        this.instance.chats.splice(index, 1);
      });
    });

    // Handle receiving initial contacts
    socket?.ev.on("contacts.upsert", (contacts) => {
      this.instance.contacts.push(...contacts);
    });

    const createData = async (message: proto.IWebMessageInfo) => {
      const create = await this.prismaClient?.chats_whatsapp.create({
        data: {
          jid: message.key.remoteJid!,
          fromMe: message.key.fromMe!,
          messageId: message.key.id!,
          pushName: message.pushName!,
          message: JSON.stringify(message.message),
          reference: this.authState.state.creds.me?.id!,
          instance: this.key
        }
      })
      .then(result => $log.info('Insert completed: ', result))
      .catch(err => $log.error('Failed to insert data', err));

      console.log('CREATE: ', create)
    };

    // Handle new messages
    socket?.ev.on("messages.upsert", async (t) => {
      const message = t.messages[0];

      if(message.key.remoteJid !== 'status@broadcast') {
        console.log('MESSAGE: ', message);
        // push new msg
        await createData(message);
      }

      if (t.type != "notify") {
        return;
      } // No new message is receive

      t.messages.map(async (m) => {
        if (!m.message) return; // if there is no text or media message

        // If msg is fromMe, then just don't proceed
        if (m.key.fromMe) return;

        const messageType = Object.keys(m.message)[0]; // get what type of message it is -- text, image, video
        // if messageType is protocolMessage, just dont send it
        if (
          ["protocolMessage", "senderKeyDistributionMessage"].includes(
            messageType
          )
        )
          return;

        const messageToSend: any = {
          ...m,
          instance_key: this.key,
          jid: this.instance.socket?.user.id,
          messageType,
        };

        this.sendWebhookMessage(messageToSend); // Send the message to the API
      });
    });

    // On connect event
    socket?.ev.on(
      "connection.update",
      async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect } = update;

        if (connection == "connecting") {
          return;
        }

        if (connection) {
          this.sendWebhookMessage({
            instance_key: this.key,
            connection_state: connection,
            messageType: "connection_update",
            closeReason: (lastDisconnect?.error as Boom)?.output.statusCode,
          });
          if (env.PUSHER_APP_ID !== "") {
            this.pusherInstance.trigger(this.key, "connection_update", {
              connectionState: connection,
              userData:
                connection == "open" ? this.instance.socket?.user : undefined,
            });
          }
        }

        if (connection === "close") {
          // reconnect if not logged out
          if (
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut
          ) {
            this.connect();
          } else {
            unlinkSync(`./instances/${this.key}.json`);
            // @ts-ignore
            this.instance.socket.user = null;
          }
        }
        // Handle qrcode update
        if (update.qr) {
          if (this.instance.qrcodeCount >= 5) {
            this.instance.socket?.ev.removeAllListeners("connection.update");
            return this.instance.socket?.end(
              new Boom("QR code limit reached, please login again", {
                statusCode: DisconnectReason.badSession,
              })
            );
          }

          this.instance.qrcodeCount++;

          QRCode.toDataURL(update.qr).then((url: string) => {
            this.instance.qrCode = url;
            if (env.PUSHER_APP_ID !== "") {
              this.pusherInstance.trigger(this.key, "qrcode_update", {
                qrcode: url,
              });
            }
            this.sendWebhookMessage({
              instance_key: this.key,
              qrcode: url,
              messageType: "qrcode_update",
            });
          });
        }
      }
    );
  }

  private numberIsBr(jid: string): any {
    const regexp = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/);
    if (regexp.test(jid)) {
      const match = regexp.exec(jid);
      if (match && match[1] === '55' && Number.isInteger(Number.parseInt(match[2]))) {
        const ddd = Number.parseInt(match[2]);
        if (ddd < 31) {
          return match[0];
        } else if (ddd >= 31) {
          return match[1] + match[2] + match[3];
        }
      }
    } else {
      return jid;
    }
  }

  createId(jid: string) {
    if (jid.includes("@g.us") || jid.includes("@s.whatsapp.net")) {
      return this.numberIsBr(jid);
    }

    return jid.includes("-") ? `${jid}@g.us` : `${this.numberIsBr(jid)}@s.whatsapp.net`;
  }

  // Check if jid is registered on WhatsApp
  async isRegistered(jid: string) {
    if (jid.includes("@g.us")) {
      return { exists: true, jid };
    }

    const [result] = (await this.instance.socket?.onWhatsApp(
      this.createId(jid)
    )) as {
      exists: boolean;
      jid: string;
    }[];
    return result;
  }

  async findMessages(query: { myJid: string, number?: string }): Promise<chats_whatsapp[]> {
    const where: any = {};
    if(query.number){
      const jid  = this.createId(query.number);
      where.AND = [{ reference: query.myJid, jid }];
    } else {
      where.reference = query.myJid;
    }

    const rawMessages = await this.prismaClient?.chats_whatsapp.findMany({ 
      where 
    }) as chats_whatsapp[];

    if(!rawMessages) {
      throw new BadRequest('No data')
    }

    return Array.from(rawMessages, raw => {
      return {
        id: raw.id,
        jid: raw.jid,
        fromMe: raw.fromMe,
        messageId: raw.messageId,
        pushName: raw.pushName,
        message: JSON.parse(raw.message as string) as proto.IMessage,
        reference: raw.reference,
        instance: raw.instance
      }
    })
  }

  // Method to send a message to a user
  async sendMessageToMany(to: string[], text: string) {
    const validNumbers: string[] = [];
    const invalidNumbers: string[] = [];
    const dataToSend = {};

    await Promise.all(
      to.map(async (numer) => {
        // CCheck if numer is registerd
        if (await this.isRegistered(numer)) {
          validNumbers.push(numer);
        } else {
          invalidNumbers.push(numer);
        }
      })
    );

    await Promise.all(
      validNumbers.map(async (jid) => {
        dataToSend[jid] = await this.instance.socket?.sendMessage(
          this.createId(jid),
          {
            text,
          }
        );
      })
    );

    return {
      sent: validNumbers.length,
      failed: invalidNumbers.length,
      data: dataToSend,
    };
  }

  async downloadMessage(
    message: DownloadableMessage,
    messageType: "image" | "audio" | "video" | "document",
  ) {
    let buffer = Buffer.from([]);
    try {
      const stream = await downloadContentFromMessage(message, messageType);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      } // download the media message
    } catch {
      throw new Forbidden("Unable to download file");
    }
    return buffer.toString("base64");
  }

  // send a single message
  async sendMessage(to: string, text: string) {
    if (!(await this.isRegistered(to))) {
      throw new Forbidden("Number not registered on WhatsApp");
    }
    const jid = this.createId(to);
    return await this.instance.socket?.sendMessage(jid, {
      text,
    });
  }

  processButtons = (buttons: Button[]) => {
    const finalButtons: proto.IHydratedTemplateButton[] = [];

    buttons.map((button) => {
      if (button.type == "replyButton") {
        finalButtons.push({
          quickReplyButton: {
            displayText: button.title ?? "",
          },
        });
      }

      if (button.type == "callButton") {
        finalButtons.push({
          callButton: {
            displayText: button.title ?? "",
            phoneNumber: button.payload ?? "",
          },
        });
      }
      if (button.type == "urlButton") {
        finalButtons.push({
          urlButton: {
            displayText: button.title ?? "",
            url: button.payload ?? "",
          },
        });
      }
    });
    return finalButtons;
  };

  // Send a Media Message
  async sendMediaMessage(data: {
    to: string;
    type: "video" | "audio" | "image" | "document";
    caption?: string;
    bufferData: PlatformMulterFile;
  }) {
    if (!(await this.isRegistered(data.to))) {
      throw new Forbidden("User not registered on WhatsApp");
    }

    // @ts-ignore
    return await this.instance.socket?.sendMessage(this.createId(data.to), {
      mimetype: data.bufferData.mimetype,
      [data.type]: data.bufferData.buffer,
      caption: data.caption,
      ptt: data.type == "audio" ? true : false,
      fileName: data.type == "document" ? data.bufferData.originalname : false, //added by Raj for document name appearance
    });
  }

  async sendUrlMediaMessage(data: {
    to: string;
    type: "video" | "audio" | "image" | "document";
    mimeType: string;
    caption?: string;
    url: string;
  }) {
    if (!(await this.isRegistered(data.to))) {
      throw new Forbidden("Number not registered on WhatsApp");
    }

    return await this.instance.socket?.sendMessage(this.createId(data.to), {
      [data.type]: {
        url: data.url,
      },
      caption: data.caption,
      mimetype: data.mimeType,
    } as unknown as AnyMessageContent);
  }

  async sendUrlMediaButtonMessage(data: ButtonMessageWithImage) {
    if (!(await this.isRegistered(data.to))) {
      throw new Forbidden("Number not registered on WhatsApp");
    }

    // @ts-ignore
    return await this.instance.socket?.sendMessage(this.createId(data.to), {
      [data.mediaType]: {
        url: data.imageUrl,
      },
      footer: data.footerText ?? "",
      caption: data.text,
      templateButtons: this.processButtons(data.buttons),
      mimetype: data.mimeType,
    });
  }

  async sendButtonsMessage(data: { to: string; buttonData: ButtonMessage }) {
    return await this.instance.socket
      ?.sendMessage(this.createId(data.to), {
        templateButtons: this.processButtons(data.buttonData.buttons),
        text: data.buttonData.text ?? "",
        footer: data.buttonData.footerText ?? "",
      })
      .catch((err) => { });
  }

  async sendLocationMessage(data: LocationMessage) {
    return await this.instance.socket
      ?.sendMessage(this.createId(data.to), {
        location: {
          degreesLatitude: data.coordinates.lat,
          degreesLongitude: data.coordinates.long,
        },
        text: data.caption,
        caption: data.caption,
      })
      .catch((err) => { });
  }

  async sendContactMessage(data: SendVCardData) {
    const vcard =
      "BEGIN:VCARD\n" + // metadata of the contact card
      "VERSION:3.0\n" +
      `FN:${data.vcard.fullName}\n` + // full name
      `ORG:${data.vcard.organization};\n` + // the organization of the contact
      `TEL;type=CELL;type=VOICE;waid=${data.vcard.phoneNumber}:${data.vcard.phoneNumber}\n` + // WhatsApp ID + phone number
      "END:VCARD";

    return await this.instance.socket?.sendMessage(
      await this.createId(data.to),
      {
        contacts: {
          displayName: data.vcard.fullName,
          contacts: [{ displayName: data.vcard.fullName, vcard }],
        },
      }
    );
  }

  async sendListMessage(data: SendListMessageData) {
    return await this.instance.socket?.sendMessage(this.createId(data.to), {
      text: data.text,
      sections: data.sections,
      buttonText: data.buttonText,
      footer: data.description,
      title: data.title,
    });
  }

  async getAllGroups() {
    return this.instance.chats.filter((c) => c.id.includes("@g.us"));
  }

  async getGroupInfo(groupId: string, raiseError?: boolean) {
    const group = this.instance.chats.find((c) => c.id === groupId);

    if (!group) {
      throw new NotFound("Group not found");
    }
    try {
      const metadata = await this.instance.socket?.groupMetadata(groupId);
      return metadata;
    } catch (err) {
      if (raiseError == true) {
        throw new NotFound("Group not found");
      }
      return null;
    }
  }

  async getAdminGroups(withParticipants: boolean = false) {
    const user = this.instance.socket?.user;
    // @ts-ignore
    user.id = this.makeUserId(user?.id);

    const groups = await this.getAllGroups();

    const groupMetadata = await Promise.all(
      groups.map((g) => this.getGroupInfo(g.id, false))
    );

    const finalGroups = groupMetadata.filter((g) => {
      const result = g?.participants.find(
        (p) =>
          p.id == user?.id && ["admin", "superadmin"].includes(p.admin as any)
      );
      if (result) {
        return true;
      } else {
        false;
      }
    });

    return withParticipants
      ? finalGroups
      : //@ts-ignore
      finalGroups.map((g) => (g.participants = []));
  }

  async createGroup(name: string, participants: string[]) {
    const group = await this.instance.socket?.groupCreate(
      name,
      participants.map(this.createId)
    );

    return group;
  }

  async getGroupInviteCode(group_id: string) {
    const group = this.instance.chats.find((c) => c.id === group_id);

    if (!group) {
      throw new NotFound("Group not found");
    }

    return await this.instance.socket?.groupInviteCode(group_id);
  }

  async changeGroupSettings(
    group_id: string,
    setting: "announcement" | "not_announcement" | "locked" | "unlocked"
  ) {
    const group = this.instance.chats.find((c) => c.id === group_id);

    if (!group) {
      throw new NotFound("Group not found");
    }

    return await this.instance.socket?.groupSettingUpdate(group_id, setting);
  }

  async updateGroup(
    group_id: string,
    users: string[],
    action: "add" | "remove" | "promote" | "demote"
  ) {
    const group = this.instance.chats.find((c) => c.id === group_id);

    if (!group) {
      throw new NotFound("Group not found");
    }
    return await this.instance.socket?.groupParticipantsUpdate(
      group.id,
      users.map(this.createId),
      action
    );
  }

  async leaveGroup(group_id: string) {
    const group = this.instance.chats.find((c) => c.id === group_id);

    if (!group) {
      throw new NotFound("Group not found");
    }
    return await this.instance.socket?.groupLeave(group_id);
  }
}
