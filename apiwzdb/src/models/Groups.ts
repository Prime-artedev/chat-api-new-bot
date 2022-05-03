import { CollectionOf, Property, Schema } from "@tsed/schema";

export class CreateGroupData {
  @Property()
  group_name: string;

  @Property()
  @CollectionOf(String)
  participants: string[];
}

export class GroupData {
  @Property()
  group_id: string;

  @Property()
  @CollectionOf(String)
  participants: string[];
}
