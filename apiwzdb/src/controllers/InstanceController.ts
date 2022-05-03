import {
  // @ts-ignore
  Controller,
  Delete,
  Get,
  Inject,
  MultipartFile,
  Post,
  Put,
  Req,
} from "@tsed/common";

import { View } from "@tsed/platform-views";

import fs from "fs";

import { Description, Returns, Summary } from "@tsed/schema";
import { WhatsAppInstance } from "../services/Instance";
import { BodyParams, PathParams, QueryParams } from "@tsed/platform-params";
import {
  ButtonMessage,
  ButtonMessageWithImage,
  LocationMessage,
  MediaMessageKeys,
  MediaUrlMessage,
  SendListMessageData,
  SendVCardData,
  TextMessge,
  TextMessgeSingle,
} from "../models/SendMessge";
import { Middleware, UseBefore } from "@tsed/platform-middlewares";
import { Forbidden, NotFound, Unauthorized } from "@tsed/exceptions";

import { PlatformMulterFile } from "@tsed/common";
import { GroupData, CreateGroupData } from "../models/Groups";
import {
  mediaUrlDescription,
  templateMessageDescription,
} from "../utils/texts";
import {
  UpdateWebhookStatusSchema,
  UpdateWebhookUrlSchema,
} from "../models/Webhook";
import { PrismaClient } from "@prisma/client";

// Object containing the all instances
const instances: Record<string, WhatsAppInstance> = {};

// Start Middlewares
//Middlware to check if the instance_key passed is valid or not
@Middleware()
export class InstanceKeyVerificationMiddleware {
  use(@Req() req: Req): void {
    const key = req.params["instance_key"];
    console.log(key);

    // Throw 403 error if the instance_key is not provided
    const err = new Forbidden(
      "Invalid instance_key supplied -- in instanceVerificationMiddleware"
    );

    if (!key) {
      throw err;
    }
    const instance = instances[key];
    if (!instance) {
      // throw err;
      // Throw 404 error if the instance_key is not found
      throw new NotFound("Instance not found");
    }
  }
}

@Middleware()
export class InstanceLoginVerificationMiddleware {
  use(@Req() req: Req): void {
    const key = req.params["instance_key"];
    console.log(key);

    const err = new Unauthorized("Instance not logged in");

    if (!key) {
      throw new Forbidden("Invalid instance_key supplied");
    }
    const instance = instances[key];
    if (!instance.instance.socket?.user) {
      throw err;
    }
  }
}
// End Middlewares

// Restore all instances

let instanceKeys: string[] = [];
const listOfFiles = fs.readdirSync("./instances");
listOfFiles.map((file) => {
  if (file.includes(".json")) {
    instanceKeys.push(file.replace(".json", ""));
  }
});
instanceKeys.map((key) => {
  const prismaClient = new PrismaClient();
  const instance = new WhatsAppInstance(key, prismaClient);
  instance.connect();
  instances[key] = instance;
});

@Controller("/instance")
export class InstanceController {

  constructor(@Inject() private readonly prismaClient: PrismaClient) { }

  @Post("/init")
  @Summary("Initialize a new WhatsApp instance")
  async CreateNewWhatsAppInstance(
    @QueryParams("instance_key") instance_key?: string,
    @QueryParams("disableWebhook") disableWebhook?: boolean
  ) {
    const instance = new WhatsAppInstance(
      instance_key,
      this.prismaClient,
      disableWebhook == undefined ? false : disableWebhook
    );
    instances[instance.key] = instance;
    return {
      error: false,
      message: "Instance created",
      instance_key: instance.key,
    };
  }

  @Get("/list")
  @Summary("List all instances")
  ListInstances() {
    return {
      error: false,
      message: "Instances listed",
      instances: Object.keys(instances).map((key) => instances[key].getSelf()),
    };
  }

  @Get("/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @Summary("Get an instance")
  GetInstanceData(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key]) {
      return {
        error: false,
        message: "Instance data fetched",
        instance: instances[instance_key].getSelf(),
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/chats/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Get all your chats")
  async GetAllChats(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key]) {
      const myJid = instances[instance_key].authState.state.creds.me?.id!;
      console.log({myJid})
      return {
        error: false,
        message: "Chats fetched",
        chats: await instances[instance_key].findMessages({ myJid }),
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/contacts/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Get all your contacts")
  GetAllContacts(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key]) {
      return {
        error: false,
        message: "Contacts fetched",
        chats: instances[instance_key].instance.contacts,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/messages/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Get messages from a specific chat")
  async GetMessagesFromChat(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("number") number: string
  ) {
    if (instances[instance_key]) {
      const myJid = instances[instance_key].authState.state.creds.me?.id!;
      return await instances[instance_key].findMessages({ myJid, number });
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Post("/downloadMediaMessage/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  async downloadMediaMessage(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageKeys") message: MediaMessageKeys
  ) {
    if (instances[instance_key]) {
      const data = await instances[instance_key].downloadMessage(
        //@ts-ignore
        message,
        //@ts-ignore
        message.messageType,
      );

      return {
        error: false,
        message: "Media message downloaded",
        data: data,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/isOnWhatsApp/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Check if number is registerd on WhatsApp")
  async IsOnWhatsApp(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("jid") chat_id: string
  ) {
    if (instances[instance_key]) {
      return await instances[instance_key].isRegistered(
        instances[instance_key].createId(chat_id)
      );
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/qrcode/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @View("qrcode.ejs")
  @Summary("Get an instance")
  GetQrcode(@PathParams("instance_key") instance_key: string) {
    console.log(instances[instance_key].instance.qrCode);
    instances[instance_key].connect();
    return {
      instance_key,
      qrcode: instances[instance_key].instance.qrCode,
    };
  }

  @Get("/qrcode_base64/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @Summary("Get the qrcode in base64 format")
  GetQrcodeBase64(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key].instance.socket?.user) {
      // Throw error as user is already logged in
      throw new Forbidden("User is already logged in");
    }
    instances[instance_key].connect();
    return {
      error: false,
      message: "Qrcode fetched",
      qrcode: instances[instance_key].instance.qrCode,
    };
  }

  @Delete("/:instance_key/logout")
  @Summary("Logout from an instance")
  @UseBefore(InstanceKeyVerificationMiddleware)
  async LogoutInstance(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key]) {
      try {
        await instances[instance_key].instance.socket?.logout();
      } catch (err) {
        console.log(err);
      }

      return {
        error: false,
        message: "Instance logged out",
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Delete("/:instance_key/delete")
  @Summary("Delete an instance")
  async DeleteInstance(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key]) {
      // delete instances[instance_key];
      try {
        await instances[instance_key].instance.socket?.logout();
        instances[instance_key].instance.socket?.end({
          message: "Instance deleted",
          name: "InstanceDeleted",
        });
      } catch (err) {
        console.log(err);
      }
      delete instances[instance_key];
      return {
        error: false,
        message: "Instance deleted",
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }
}

// Webhook Controller
@Controller("/webhook")
export class WebhookController {
  @Get("/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @Summary("Get an instance webhook data")
  GetWebhookStauts(@PathParams("instance_key") instance_key: string) {
    return {
      error: false,
      message: "Webhook status fetched",
      webhookData: {
        webhookUrl: instances[instance_key].secondaryWebhookUrl,
        webhookEnabled: instances[instance_key].sendSecondaryWebhookMessage,
      },
    };
  }

  @Post("/:instance_key/updateUrl")
  @UseBefore(InstanceKeyVerificationMiddleware)
  async updateWebhookUrl(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("data") webhookData: UpdateWebhookUrlSchema
  ) {
    const data = instances[instance_key].updateWebhookData({
      url: webhookData.url,
    });
    return {
      error: false,
      message: "Webhook url updated",
      data,
    };
  }

  @Post("/:instance_key/enableMessage")
  @UseBefore(InstanceKeyVerificationMiddleware)
  async enableMessageWebhook(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("data") webhookData: UpdateWebhookStatusSchema
  ) {
    const data = instances[instance_key].updateWebhookData({
      sendMessage: webhookData.sendWebhook,
    });
    return {
      error: false,
      message: webhookData.sendWebhook
        ? "Message webhook enabled"
        : "Message webhook disabled",
      data,
    };
  }
}

// Send Message Controller
@Controller("/sendMessage")
export class SendMessageController {
  @Post("/:instance_key/textToMany")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send a text message to multiple WhatsApp users")
  @Description(`Note that while sending to single chat, the id should not contain @s.whatsapp.net. <br>
    However, while sending to groups, the id should end with @g.us <br>
    `)
  async SendTextMessage(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: TextMessge
  ) {
    if (instances[instance_key]) {
      const msgData = await instances[instance_key].sendMessageToMany(
        data.to,
        data.text
      );
      return {
        error: false,
        message: "Message sent",
        messageData: msgData,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Post("/:instance_key/text")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send a text message to an WhatsApp User")
  @Description(`Note that while sending to single chat, the id should not contain @s.whatsapp.net. <br>
    However, while sending to groups, the id should end with @g.us <br>
    `)
  async SendTextMessageToSingleUser(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: TextMessgeSingle
  ) {
    if (instances[instance_key]) {
      const msgData = await instances[instance_key].sendMessage(
        data.to,
        data.text
      );
      return {
        error: false,
        message: "Message sent",
        messageData: msgData,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Post("/:instance_key/mediaUrl")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send a media message via a URL")
  @Description(mediaUrlDescription)
  async SendMediaUrl(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: MediaUrlMessage
  ) {
    const msgData = await instances[instance_key].sendUrlMediaMessage(data);

    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/image")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send an image message to an WhatsApp User")
  async SendImageMessage(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("to") id: string,
    @QueryParams("caption") caption: string,
    @MultipartFile("file") file: Express.Multer.File
  ) {
    const msgData = await instances[instance_key].sendMediaMessage({
      to: id,
      caption: caption,
      type: "image",
      bufferData: file,
    });

    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/video")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send an video to an WhatsApp User")
  async SendVideoMessage(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("to") id: string,
    @QueryParams("caption") caption: string,
    @MultipartFile("file") file: PlatformMulterFile
  ) {
    const msgData = await instances[instance_key].sendMediaMessage({
      to: id,
      caption: caption,
      type: "video",
      bufferData: file as PlatformMulterFile,
    });
    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/audio")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send an audio to an WhatsApp User")
  async SendAudioMessage(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("to") id: string,
    @QueryParams("caption") caption: string,
    @MultipartFile("file") file: PlatformMulterFile
  ) {
    const msgData = await instances[instance_key].sendMediaMessage({
      to: id,
      caption: caption,
      type: "audio",
      bufferData: file as PlatformMulterFile,
    });
    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/document")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send an document to an WhatsApp User")
  async SendDocumentMessage(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("to") id: string,
    @QueryParams("caption") caption: string,
    @MultipartFile("file") file: PlatformMulterFile
  ) {
    const msgData = await instances[instance_key].sendMediaMessage({
      to: id,
      caption: caption,
      type: "document",
      bufferData: file as PlatformMulterFile,
    });
    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/location")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send an location to an WhatsApp User")
  async SendLocationMessage(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: LocationMessage
  ) {
    const msgData = await instances[instance_key].sendLocationMessage({
      ...data,
    });
    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/templateMessage")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Description(templateMessageDescription)
  @Summary("Send an interactive template message to an WhatsApp User")
  async SendButtonsMessage(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: ButtonMessage
  ) {
    const msgData = await instances[instance_key].sendButtonsMessage({
      to: data.to,
      buttonData: data,
    });

    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/templateMessageWithMedia")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Description(templateMessageDescription)
  @Summary(
    "Send an interactive template message with mediaHeader to an WhatsApp User"
  )
  async SendButtonsMessageWithMedia(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: ButtonMessageWithImage
  ) {
    const msgData = await instances[instance_key].sendUrlMediaButtonMessage(
      data
    );

    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/contactMessage")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send an vacard message to an WhatsApp User")
  async SendTemplateMesssage(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: SendVCardData
  ) {
    const msgData = await instances[instance_key].sendContactMessage(data);

    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }

  @Post("/:instance_key/listMessage")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Send an vacard message to an WhatsApp User")
  async SendListMessage(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("messageData") data: SendListMessageData
  ) {
    const msgData = await instances[instance_key].sendListMessage(data);

    return {
      error: false,
      message: "Message sent",
      messageData: msgData,
    };
  }
}

// Group Controller
@Controller("/group")
@Description("Endpoints related to management of groups")
@Returns(200, String).Description("Action completed successfully")
@Returns(401, Unauthorized).Description("Phone not connected")
@Returns(403, Forbidden).Description("Invalid Instance Key")
@Returns(404, NotFound).Description("Instance not found")
export class GroupController {
  @Get("/list/:instance_key")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("List all groups")
  async ListGroups(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key]) {
      const groups = await instances[instance_key].getAllGroups();
      return {
        error: false,
        message: "Groups listed",
        groups: groups,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/:instance_key/adminGroups/")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("List all groups in which you are and admin")
  async GetAdminGroups(@PathParams("instance_key") instance_key: string) {
    if (instances[instance_key]) {
      const groups = await instances[instance_key].getAdminGroups(false);
      return {
        error: false,
        message: "Groups fetched",
        groups,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/:instance_key/adminGroupsWithParticipants/")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary(
    "List all groups in which you are and admin along with the participants array"
  )
  async GetAdminGroupsWithParticipants(
    @PathParams("instance_key") instance_key: string
  ) {
    if (instances[instance_key]) {
      const groups = await instances[instance_key].getAdminGroups(true);
      return {
        error: false,
        message: "Groups fetched",
        groups,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Get("/:instance_key/group/:group_id")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Get a group")
  @Description(
    "Please note that the group_id should contain @g.us in the end for example: 123456789@g.us"
  )
  async GetGroup(
    @PathParams("instance_key") instance_key: string,
    @PathParams("group_id") group_id: string
  ) {
    if (instances[instance_key]) {
      const group = await instances[instance_key].getGroupInfo(group_id);
      return {
        error: false,
        message: "Group fetched",
        group,
      };
    } else {
      return {
        error: true,
        message: "Instance not found",
      };
    }
  }

  @Post("/:instance_key/create")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Create a group")
  @Description(
    "Please note that the participants should not contain @s.whatsapp.net"
  )
  async CreateGroup(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("group_data") data: CreateGroupData
  ) {
    const group = await instances[instance_key].createGroup(
      data.group_name,
      data.participants
    );
    return {
      error: false,
      message: "Group created",
      group,
    };
  }

  @Post("/:instance_key/addParticipants")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Add participants to a group")
  @Description(
    `Please note that the participants should not contain @s.whatsapp.net <br>`
  )
  async AddToGroup(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("group_data") data: GroupData
  ) {
    const group = await instances[instance_key].updateGroup(
      data.group_id,
      data.participants,
      "add"
    );
    return {
      error: false,
      message: "Participants added",
      updatedParticipants: group,
    };
  }

  @Delete("/:instance_key/removeParticipants")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Remove participants from group")
  @Description(
    `Please note that the participants should not contain @s.whatsapp.net <br>`
  )
  async RemoveFromGroup(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("group_data") data: GroupData
  ) {
    const group = await instances[instance_key].updateGroup(
      data.group_id,
      data.participants,
      "remove"
    );
    return {
      error: false,
      message: "Participants removed",
      updatedParticipants: group,
    };
  }

  @Get("/:instance_key/groupInviteCode")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Get group invite code")
  async GetGroupInviteCode(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("group_id") group_id: string
  ) {
    const inviteCode = await instances[instance_key].getGroupInviteCode(
      group_id
    );
    return {
      error: false,
      message: "Group invite code fetched",
      inviteCode,
    };
  }

  @Delete("/:instance_key/demoteParticipants")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Demote certain participants in group")
  @Description(
    `Please note that the participants should not contain @s.whatsapp.net <br>`
  )
  async DemoteParticipants(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("group_data") data: GroupData
  ) {
    const group = await instances[instance_key].updateGroup(
      data.group_id,
      data.participants,
      "demote"
    );
    return {
      error: false,
      message: "Participants demoted",
      updatedParticipants: group,
    };
  }

  @Post("/:instance_key/promoteParticipants")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Promote certain participants in group")
  @Description(
    `Please note that the participants should not contain @s.whatsapp.net <br>`
  )
  async PromoteParticipants(
    @PathParams("instance_key") instance_key: string,
    @BodyParams("group_data") data: GroupData
  ) {
    const group = await instances[instance_key].updateGroup(
      data.group_id,
      data.participants,
      "promote"
    );
    return {
      error: false,
      message: "Participants promoted",
      updatedParticipants: group,
    };
  }

  @Put("/:instance_key/setWhoCanSendMessage")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Set who can send message in group")
  @Description(
    `Please note that the participants should not contain @s.whatsapp.net <br>`
  )
  async SetWhoCanSendMessage(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("group_id") group_id: string,
    @QueryParams("allowOnlyAdmins") allowOnlyAdmins: boolean
  ) {
    const group = await instances[instance_key].changeGroupSettings(
      group_id,
      allowOnlyAdmins ? "announcement" : "not_announcement"
    );
    return {
      error: false,
      message: "Settings updated",
    };
  }

  @Put("/:instance_key/setWhoCanChangeSettings")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Set who can change settings of group")
  @Description(
    `Please note that the participants should not contain @s.whatsapp.net <br>`
  )
  async SetWhoCanChangeSettings(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("group_id") group_id: string,
    @QueryParams("allowOnlyAdmins") allowOnlyAdmins: boolean
  ) {
    const group = await instances[instance_key].changeGroupSettings(
      group_id,
      allowOnlyAdmins ? "locked" : "unlocked"
    );
    return {
      error: false,
      message: "Settings updated",
    };
  }

  @Delete("/:instance_key/leaveGroup")
  @UseBefore(InstanceKeyVerificationMiddleware)
  @UseBefore(InstanceLoginVerificationMiddleware)
  @Summary("Leave group")
  async LeaveGroup(
    @PathParams("instance_key") instance_key: string,
    @QueryParams("group_id") group_id: string
  ) {
    await instances[instance_key].leaveGroup(group_id);
    return {
      error: false,
      message: "Left group",
    };
  }
}
