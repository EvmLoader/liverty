// models/nftLike.ts

import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAsset, nftAssetId } from "./nftAsset";
import type { user, userId } from "./user";

export interface nftLikeAttributes {
  id: string;
  nftAssetId: string;
  userId: string;
  createdAt?: Date;
}

export type nftLikePk = "id";
export type nftLikeId = nftLike[nftLikePk];
export type nftLikeOptionalAttributes = "id" | "createdAt";
export type nftLikeCreationAttributes = Optional<
  nftLikeAttributes,
  nftLikeOptionalAttributes
>;

export class nftLike
  extends Model<nftLikeAttributes, nftLikeCreationAttributes>
  implements nftLikeAttributes
{
  id!: string;
  nftAssetId!: string;
  userId!: string;
  createdAt?: Date;

  // nftLike belongsTo nftAsset via nftAssetId
  nftAsset!: nftAsset;
  getNftAsset!: Sequelize.BelongsToGetAssociationMixin<nftAsset>;
  setNftAsset!: Sequelize.BelongsToSetAssociationMixin<nftAsset, nftAssetId>;
  createNftAsset!: Sequelize.BelongsToCreateAssociationMixin<nftAsset>;

  // nftLike belongsTo user via userId
  user!: user;
  getUser!: Sequelize.BelongsToGetAssociationMixin<user>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createUser!: Sequelize.BelongsToCreateAssociationMixin<user>;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftLike {
    return nftLike.init(
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
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
      },
      {
        sequelize,
        tableName: "nft_like",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "nftLikeUniqueIndex",
            unique: true,
            fields: [{ name: "nftAssetId" }, { name: "userId" }],
          },
        ],
      }
    );
  }
}
