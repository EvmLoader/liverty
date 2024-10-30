// models/nftComment.ts

import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAsset, nftAssetId } from "./nftAsset";
import type { user, userId } from "./user";

export interface nftCommentAttributes {
  id: string;
  nftAssetId: string;
  userId: string;
  comment: string;
  createdAt?: Date;
}

export type nftCommentPk = "id";
export type nftCommentId = nftComment[nftCommentPk];
export type nftCommentOptionalAttributes = "id" | "createdAt";
export type nftCommentCreationAttributes = Optional<
  nftCommentAttributes,
  nftCommentOptionalAttributes
>;

export class nftComment
  extends Model<nftCommentAttributes, nftCommentCreationAttributes>
  implements nftCommentAttributes
{
  id!: string;
  nftAssetId!: string;
  userId!: string;
  comment!: string;
  createdAt?: Date;

  // nftComment belongsTo nftAsset via nftAssetId
  nftAsset!: nftAsset;
  getNftAsset!: Sequelize.BelongsToGetAssociationMixin<nftAsset>;
  setNftAsset!: Sequelize.BelongsToSetAssociationMixin<nftAsset, nftAssetId>;
  createNftAsset!: Sequelize.BelongsToCreateAssociationMixin<nftAsset>;

  // nftComment belongsTo user via userId
  user!: user;
  getUser!: Sequelize.BelongsToGetAssociationMixin<user>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createUser!: Sequelize.BelongsToCreateAssociationMixin<user>;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftComment {
    return nftComment.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        nftAssetId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            isUUID: { args: 4, msg: "nftAssetId: Must be a valid UUID" },
          },
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            isUUID: { args: 4, msg: "userId: Must be a valid UUID" },
          },
        },
        comment: {
          type: DataTypes.TEXT,
          allowNull: false,
          validate: {
            notEmpty: { msg: "comment: Comment must not be empty" },
          },
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
      },
      {
        sequelize,
        tableName: "nft_comment",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "nftCommentNftAssetIdIndex",
            fields: [{ name: "nftAssetId" }],
          },
          {
            name: "nftCommentUserIdIndex",
            fields: [{ name: "userId" }],
          },
        ],
      }
    );
  }
}
