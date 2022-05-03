import { Property } from "@tsed/schema";

export class UpdateWebhookUrlSchema {
  @Property()
  url: string;
}

export class UpdateWebhookStatusSchema {
  @Property()
  sendWebhook: boolean;
}
