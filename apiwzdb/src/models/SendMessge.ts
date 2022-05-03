import { CollectionOf, Property, Required } from "@tsed/schema";

export class TextMessge {
  @Property()
  @CollectionOf(String)
  to: string[];

  @Property()
  text: string;
}

export class TextMessgeSingle {
  @Property()
  to: string;

  @Property()
  text: string;
}

export class LocationCordinates {
  @Property()
  lat: number;

  @Property()
  long: number;
}

export class LocationMessage {
  @Property()
  to: string;

  @Property()
  caption: string;

  @Property()
  coordinates: LocationCordinates;
}

export class Button {
  @Property()
  type: "replyButton" | "urlButton" | "callButton";

  @Property()
  title: string;

  @Property()
  @Required(false)
  payload: string;
}

export class ButtonMessage {
  @Property()
  to: string;

  @Property()
  text: string;

  @Property()
  @CollectionOf(Button)
  buttons: Button[];

  @Property()
  footerText: string;
}

export class ButtonMessageWithImage extends ButtonMessage {
  @Property()
  imageUrl: string;

  @Property()
  mediaType: "image" | "video" | "audio";

  @Property()
  mimeType: string;
}

export class MediaMessageKeys {
  @Property()
  mediaKey: string;

  @Property()
  directPath: string;

  @Property()
  url: string;

  @Property()
  messageType: string;
}

export class ContactData {
  @Property()
  fullName: string;

  @Property()
  displayName: string;

  @Property()
  organization?: string;

  @Property()
  phoneNumber: string;
}
export class SendVCardData {
  @Property()
  to: string;

  @Property()
  vcard: ContactData;
}

export class ListRow {
  @Property()
  title: string;

  @Property()
  description: string;

  @Property()
  rowId: string;
}

export class ListSection {
  @Property()
  title: string;

  @Property()
  @CollectionOf(ListRow)
  rows: ListRow[];
}

export class SendListMessageData {
  @Property()
  to: string;

  @Property()
  buttonText: string;

  @Property()
  text: string;

  @Property()
  title: string;

  @Property()
  description: string;

  @Property()
  @CollectionOf(ListSection)
  sections: ListSection[];

  @Property()
  listType: number;
}

export class MediaUrlMessage {
  @Property()
  to: string;

  @Property()
  url: string;

  @Property()
  type: "image" | "video" | "audio" | "document";

  @Property()
  caption?: string;

  @Property()
  mimeType: string;
}
