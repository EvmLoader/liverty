import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAsset, nftAssetId } from "./nftAsset";
import type { user, userId } from "./user";

export interface nftTransactionAttributes {
  id: string;
  nftAssetId: string;
  sellerId: string;
  buyerId: string;
  price: number;
  transactionHash: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt?: Date;
  updatedAt?: Date;
}

export type nftTransactionPk = "id";
export type nftTransactionId = nftTransaction[nftTransactionPk];
export type nftTransactionOptionalAttributes =
  | "id"
  | "status"
  | "createdAt"
  | "updatedAt";
export type nftTransactionCreationAttributes = Optional<
  nftTransactionAttributes,
  nftTransactionOptionalAttributes
>;

export class nftTransaction
  extends Model<nftTransactionAttributes, nftTransactionCreationAttributes>
  implements nftTransactionAttributes
{
  id!: string;
  nftAssetId!: string;
  sellerId!: string;
  buyerId!: string;
  price!: number;
  transactionHash!: string;
  status!: "PENDING" | "COMPLETED" | "FAILED";
  createdAt?: Date;
  updatedAt?: Date;

  // nftTransaction belongsTo nftAsset via nftAssetId
  nftAsset!: nftAsset;
  getNftAsset!: Sequelize.BelongsToGetAssociationMixin<nftAsset>;
  setNftAsset!: Sequelize.BelongsToSetAssociationMixin<nftAsset, nftAssetId>;
  createNftAsset!: Sequelize.BelongsToCreateAssociationMixin<nftAsset>;

  // nftTransaction belongsTo user via sellerId
  seller!: user;
  getSeller!: Sequelize.BelongsToGetAssociationMixin<user>;
  setSeller!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createSeller!: Sequelize.BelongsToCreateAssociationMixin<user>;

  // nftTransaction belongsTo user via buyerId
  buyer!: user;
  getBuyer!: Sequelize.BelongsToGetAssociationMixin<user>;
  setBuyer!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createBuyer!: Sequelize.BelongsToCreateAssociationMixin<user>;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftTransaction {
    return nftTransaction.init(
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
        sellerId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            isUUID: { args: 4, msg: "sellerId: Must be a valid UUID" },
          },
        },
        buyerId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            isUUID: { args: 4, msg: "buyerId: Must be a valid UUID" },
          },
        },
        price: {
          type: DataTypes.DOUBLE,
          allowNull: false,
          validate: {
            isFloat: { msg: "price: Must be a valid number" },
            min: { args: [0], msg: "price: Price cannot be negative" },
          },
        },
        transactionHash: {
          type: DataTypes.STRING(191),
          allowNull: false,
          validate: {
            notEmpty: { msg: "transactionHash: Must not be empty" },
          },
        },
        status: {
          type: DataTypes.ENUM("PENDING", "COMPLETED", "FAILED"),
          allowNull: false,
          defaultValue: "PENDING",
          validate: {
            isIn: {
              args: [["PENDING", "COMPLETED", "FAILED"]],
              msg: "status: Must be 'PENDING', 'COMPLETED', or 'FAILED'",
            },
          },
        },
      },
      {
        sequelize,
        tableName: "nft_transaction",
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
