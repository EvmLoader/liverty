// models/nftBid.ts

import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAsset, nftAssetId } from "./nftAsset";
import type { nftAuction, nftAuctionId } from "./nftAuction";
import type { user, userId } from "./user";

export interface nftBidAttributes {
  id: string;
  nftAssetId: string;
  bidderId: string;
  amount: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  auctionId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type nftBidPk = "id";
export type nftBidId = nftBid[nftBidPk];
export type nftBidOptionalAttributes =
  | "id"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "auctionId";
export type nftBidCreationAttributes = Optional<
  nftBidAttributes,
  nftBidOptionalAttributes
>;

export class nftBid
  extends Model<nftBidAttributes, nftBidCreationAttributes>
  implements nftBidAttributes
{
  id!: string;
  nftAssetId!: string;
  bidderId!: string;
  amount!: number;
  status!: "PENDING" | "ACCEPTED" | "DECLINED";
  auctionId?: string;
  createdAt?: Date;
  updatedAt?: Date;

  // nftBid belongsTo nftAsset via nftAssetId
  nftAsset!: nftAsset;
  getNftAsset!: Sequelize.BelongsToGetAssociationMixin<nftAsset>;
  setNftAsset!: Sequelize.BelongsToSetAssociationMixin<nftAsset, nftAssetId>;
  createNftAsset!: Sequelize.BelongsToCreateAssociationMixin<nftAsset>;

  // nftBid belongsTo user via bidderId
  bidder!: user;
  getBidder!: Sequelize.BelongsToGetAssociationMixin<user>;
  setBidder!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createBidder!: Sequelize.BelongsToCreateAssociationMixin<user>;

  // nftBid belongsTo nftAuction via auctionId
  nftAuction!: nftAuction;
  getNftAuction!: Sequelize.BelongsToGetAssociationMixin<nftAuction>;
  setNftAuction!: Sequelize.BelongsToSetAssociationMixin<
    nftAuction,
    nftAuctionId
  >;
  createNftAuction!: Sequelize.BelongsToCreateAssociationMixin<nftAuction>;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftBid {
    return nftBid.init(
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
        bidderId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            isUUID: { args: 4, msg: "bidderId: Must be a valid UUID" },
          },
        },
        amount: {
          type: DataTypes.DOUBLE,
          allowNull: false,
          validate: {
            isFloat: { msg: "amount: Must be a valid number" },
            min: { args: [0], msg: "amount: Amount cannot be negative" },
          },
        },
        status: {
          type: DataTypes.ENUM("PENDING", "ACCEPTED", "DECLINED"),
          allowNull: false,
          defaultValue: "PENDING",
          validate: {
            isIn: {
              args: [["PENDING", "ACCEPTED", "DECLINED"]],
              msg: "status: Must be 'PENDING', 'ACCEPTED', or 'DECLINED'",
            },
          },
        },
        auctionId: {
          type: DataTypes.UUID,
          allowNull: true,
          validate: {
            isUUID: { args: 4, msg: "auctionId: Must be a valid UUID" },
          },
        },
      },
      {
        sequelize,
        tableName: "nft_bid",
        timestamps: true,
        paranoid: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "id" }],
          },
        ],
      }
    );
  }
}
