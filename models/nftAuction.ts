// models/nftAuction.ts

import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAsset, nftAssetId } from "./nftAsset";

export interface nftAuctionAttributes {
  id: string;
  nftAssetId: string;
  startTime: Date;
  endTime: Date;
  startingBid: number;
  reservePrice?: number;
  currentBidId?: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
}

export type nftAuctionPk = "id";
export type nftAuctionId = nftAuction[nftAuctionPk];
export type nftAuctionOptionalAttributes =
  | "id"
  | "reservePrice"
  | "currentBidId";
export type nftAuctionCreationAttributes = Optional<
  nftAuctionAttributes,
  nftAuctionOptionalAttributes
>;

export class nftAuction
  extends Model<nftAuctionAttributes, nftAuctionCreationAttributes>
  implements nftAuctionAttributes
{
  id!: string;
  nftAssetId!: string;
  startTime!: Date;
  endTime!: Date;
  startingBid!: number;
  reservePrice?: number;
  currentBidId?: string;
  status!: "ACTIVE" | "COMPLETED" | "CANCELLED";

  // nftAuction belongsTo nftAsset via nftAssetId
  nftAsset!: nftAsset;
  getNftAsset!: Sequelize.BelongsToGetAssociationMixin<nftAsset>;
  setNftAsset!: Sequelize.BelongsToSetAssociationMixin<nftAsset, nftAssetId>;
  createNftAsset!: Sequelize.BelongsToCreateAssociationMixin<nftAsset>;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftAuction {
    return nftAuction.init(
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
        },
        startTime: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        endTime: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        startingBid: {
          type: DataTypes.DOUBLE,
          allowNull: false,
        },
        reservePrice: {
          type: DataTypes.DOUBLE,
          allowNull: true,
        },
        currentBidId: {
          type: DataTypes.UUID,
          allowNull: true,
        },
        status: {
          type: DataTypes.ENUM("ACTIVE", "COMPLETED", "CANCELLED"),
          allowNull: false,
          defaultValue: "ACTIVE",
        },
      },
      {
        sequelize,
        tableName: "nft_auction",
        timestamps: true,
        paranoid: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      }
    );
  }
}
