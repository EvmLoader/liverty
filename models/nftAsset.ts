// models/nftAsset.ts

import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAttribute, nftAttributeId } from "./nftAttribute";
import type { nftBid, nftBidId } from "./nftBid";
import type { nftCategory, nftCategoryId } from "./nftCategory";
import type { nftComment, nftCommentId } from "./nftComment";
import type { nftLike, nftLikeId } from "./nftLike";
import type { nftTransaction, nftTransactionId } from "./nftTransaction";
import type { nftAuction, nftAuctionId } from "./nftAuction";
import type { user, userId } from "./user";

export interface nftAssetAttributes {
  id: string;
  name: string;
  description: string;
  image: string;
  metadata?: string;
  creatorId: string;
  ownerId: string;
  categoryId?: string;
  status: boolean;
  createdAt?: Date;
  deletedAt?: Date;
  updatedAt?: Date;
  price?: number;
  chain: string;
  views: number;
  likes: number;
  royalty?: number;
}

export type nftAssetPk = "id";
export type nftAssetId = nftAsset[nftAssetPk];
export type nftAssetOptionalAttributes =
  | "id"
  | "categoryId"
  | "status"
  | "createdAt"
  | "deletedAt"
  | "updatedAt"
  | "price"
  | "royalty"
  | "views"
  | "likes";
export type nftAssetCreationAttributes = Optional<
  nftAssetAttributes,
  nftAssetOptionalAttributes
>;

export class nftAsset
  extends Model<nftAssetAttributes, nftAssetCreationAttributes>
  implements nftAssetAttributes
{
  id!: string;
  name!: string;
  description!: string;
  image!: string;
  metadata?: string;
  creatorId!: string;
  ownerId!: string;
  categoryId?: string;
  status!: boolean;
  createdAt?: Date;
  deletedAt?: Date;
  updatedAt?: Date;
  price?: number;
  chain!: string;
  views!: number;
  likes!: number;
  royalty?: number;

  // nftAsset belongsTo nftCategory via categoryId
  category!: nftCategory;
  getCategory!: Sequelize.BelongsToGetAssociationMixin<nftCategory>;
  setCategory!: Sequelize.BelongsToSetAssociationMixin<
    nftCategory,
    nftCategoryId
  >;
  createCategory!: Sequelize.BelongsToCreateAssociationMixin<nftCategory>;

  // nftAsset belongsTo user via creatorId
  creator!: user;
  getCreator!: Sequelize.BelongsToGetAssociationMixin<user>;
  setCreator!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createCreator!: Sequelize.BelongsToCreateAssociationMixin<user>;

  // nftAsset belongsTo user via ownerId
  owner!: user;
  getOwner!: Sequelize.BelongsToGetAssociationMixin<user>;
  setOwner!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createOwner!: Sequelize.BelongsToCreateAssociationMixin<user>;

  // nftAsset hasMany nftBid via nftAssetId
  nftBids!: nftBid[];
  getNftBids!: Sequelize.HasManyGetAssociationsMixin<nftBid>;
  setNftBids!: Sequelize.HasManySetAssociationsMixin<nftBid, nftBidId>;
  addNftBid!: Sequelize.HasManyAddAssociationMixin<nftBid, nftBidId>;
  addNftBids!: Sequelize.HasManyAddAssociationsMixin<nftBid, nftBidId>;
  createNftBid!: Sequelize.HasManyCreateAssociationMixin<nftBid>;
  removeNftBid!: Sequelize.HasManyRemoveAssociationMixin<nftBid, nftBidId>;
  removeNftBids!: Sequelize.HasManyRemoveAssociationsMixin<nftBid, nftBidId>;
  hasNftBid!: Sequelize.HasManyHasAssociationMixin<nftBid, nftBidId>;
  hasNftBids!: Sequelize.HasManyHasAssociationsMixin<nftBid, nftBidId>;
  countNftBids!: Sequelize.HasManyCountAssociationsMixin;

  // nftAsset hasMany nftTransaction via nftAssetId
  nftTransactions!: nftTransaction[];
  getNftTransactions!: Sequelize.HasManyGetAssociationsMixin<nftTransaction>;
  setNftTransactions!: Sequelize.HasManySetAssociationsMixin<
    nftTransaction,
    nftTransactionId
  >;
  addNftTransaction!: Sequelize.HasManyAddAssociationMixin<
    nftTransaction,
    nftTransactionId
  >;
  addNftTransactions!: Sequelize.HasManyAddAssociationsMixin<
    nftTransaction,
    nftTransactionId
  >;
  createNftTransaction!: Sequelize.HasManyCreateAssociationMixin<nftTransaction>;
  removeNftTransaction!: Sequelize.HasManyRemoveAssociationMixin<
    nftTransaction,
    nftTransactionId
  >;
  removeNftTransactions!: Sequelize.HasManyRemoveAssociationsMixin<
    nftTransaction,
    nftTransactionId
  >;
  hasNftTransaction!: Sequelize.HasManyHasAssociationMixin<
    nftTransaction,
    nftTransactionId
  >;
  hasNftTransactions!: Sequelize.HasManyHasAssociationsMixin<
    nftTransaction,
    nftTransactionId
  >;
  countNftTransactions!: Sequelize.HasManyCountAssociationsMixin;

  // nftAsset hasMany nftAttribute via nftAssetId
  nftAttributes!: nftAttribute[];
  getNftAttributes!: Sequelize.HasManyGetAssociationsMixin<nftAttribute>;
  setNftAttributes!: Sequelize.HasManySetAssociationsMixin<
    nftAttribute,
    nftAttributeId
  >;
  addNftAttribute!: Sequelize.HasManyAddAssociationMixin<
    nftAttribute,
    nftAttributeId
  >;
  addNftAttributes!: Sequelize.HasManyAddAssociationsMixin<
    nftAttribute,
    nftAttributeId
  >;
  createNftAttribute!: Sequelize.HasManyCreateAssociationMixin<nftAttribute>;
  removeNftAttribute!: Sequelize.HasManyRemoveAssociationMixin<
    nftAttribute,
    nftAttributeId
  >;
  removeNftAttributes!: Sequelize.HasManyRemoveAssociationsMixin<
    nftAttribute,
    nftAttributeId
  >;
  hasNftAttribute!: Sequelize.HasManyHasAssociationMixin<
    nftAttribute,
    nftAttributeId
  >;
  hasNftAttributes!: Sequelize.HasManyHasAssociationsMixin<
    nftAttribute,
    nftAttributeId
  >;
  countNftAttributes!: Sequelize.HasManyCountAssociationsMixin;

  // nftAsset hasOne nftAuction via nftAssetId
  nftAuction!: nftAuction;
  getNftAuction!: Sequelize.HasOneGetAssociationMixin<nftAuction>;
  setNftAuction!: Sequelize.HasOneSetAssociationMixin<nftAuction, nftAuctionId>;
  createNftAuction!: Sequelize.HasOneCreateAssociationMixin<nftAuction>;

  // nftAsset hasMany nftLike via nftAssetId
  nftLikes!: nftLike[];
  getNftLikes!: Sequelize.HasManyGetAssociationsMixin<nftLike>;
  setNftLikes!: Sequelize.HasManySetAssociationsMixin<nftLike, nftLikeId>;
  addNftLike!: Sequelize.HasManyAddAssociationMixin<nftLike, nftLikeId>;
  addNftLikes!: Sequelize.HasManyAddAssociationsMixin<nftLike, nftLikeId>;
  createNftLike!: Sequelize.HasManyCreateAssociationMixin<nftLike>;
  removeNftLike!: Sequelize.HasManyRemoveAssociationMixin<nftLike, nftLikeId>;
  removeNftLikes!: Sequelize.HasManyRemoveAssociationsMixin<nftLike, nftLikeId>;
  hasNftLike!: Sequelize.HasManyHasAssociationMixin<nftLike, nftLikeId>;
  hasNftLikes!: Sequelize.HasManyHasAssociationsMixin<nftLike, nftLikeId>;
  countNftLikes!: Sequelize.HasManyCountAssociationsMixin;

  // nftAsset hasMany nftComment via nftAssetId
  nftComments!: nftComment[];
  getNftComments!: Sequelize.HasManyGetAssociationsMixin<nftComment>;
  setNftComments!: Sequelize.HasManySetAssociationsMixin<
    nftComment,
    nftCommentId
  >;
  addNftComment!: Sequelize.HasManyAddAssociationMixin<
    nftComment,
    nftCommentId
  >;
  addNftComments!: Sequelize.HasManyAddAssociationsMixin<
    nftComment,
    nftCommentId
  >;
  createNftComment!: Sequelize.HasManyCreateAssociationMixin<nftComment>;
  removeNftComment!: Sequelize.HasManyRemoveAssociationMixin<
    nftComment,
    nftCommentId
  >;
  removeNftComments!: Sequelize.HasManyRemoveAssociationsMixin<
    nftComment,
    nftCommentId
  >;
  hasNftComment!: Sequelize.HasManyHasAssociationMixin<
    nftComment,
    nftCommentId
  >;
  hasNftComments!: Sequelize.HasManyHasAssociationsMixin<
    nftComment,
    nftCommentId
  >;
  countNftComments!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftAsset {
    return nftAsset.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(191),
          allowNull: false,
          validate: {
            notEmpty: { msg: "name: Name must not be empty" },
          },
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: false,
          validate: {
            notEmpty: { msg: "description: Description must not be empty" },
          },
        },
        image: {
          type: DataTypes.STRING(191),
          allowNull: false,
          validate: {
            notEmpty: { msg: "image: Image URL must not be empty" },
          },
        },
        metadata: {
          type: DataTypes.TEXT,
          allowNull: true,
          validate: {
            notEmpty: { msg: "metadata: Metadata must not be empty" },
          },
        },
        creatorId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            isUUID: { args: 4, msg: "creatorId: Must be a valid UUID" },
          },
        },
        ownerId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            isUUID: { args: 4, msg: "ownerId: Must be a valid UUID" },
          },
        },
        categoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          validate: {
            isUUID: { args: 4, msg: "categoryId: Must be a valid UUID" },
          },
        },
        status: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          validate: {
            isIn: {
              args: [[true, false]],
              msg: "status: Status must be true or false",
            },
          },
        },
        price: {
          type: DataTypes.DOUBLE,
          allowNull: true,
          validate: {
            isFloat: { msg: "price: Must be a valid number" },
            min: { args: [0], msg: "price: Price cannot be negative" },
          },
        },
        chain: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: "ETH",
          validate: {
            notEmpty: { msg: "chain: Chain must not be empty" },
          },
        },
        views: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          validate: {
            isInt: { msg: "views: Must be an integer" },
            min: { args: [0], msg: "views: Cannot be negative" },
          },
        },
        likes: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          validate: {
            isInt: { msg: "likes: Must be an integer" },
            min: { args: [0], msg: "likes: Cannot be negative" },
          },
        },
        royalty: {
          type: DataTypes.FLOAT,
          allowNull: true,
          validate: {
            isFloat: { msg: "royalty: Must be a valid percentage" },
            min: { args: [0], msg: "royalty: Cannot be negative" },
            max: { args: [100], msg: "royalty: Cannot exceed 100%" },
          },
        },
      },
      {
        sequelize,
        tableName: "nft_asset",
        timestamps: true,
        paranoid: true,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "nftAssetNameIndex",
            fields: [{ name: "name" }],
          },
          {
            name: "nftAssetCreatorIdIndex",
            fields: [{ name: "creatorId" }],
          },
          {
            name: "nftAssetOwnerIdIndex",
            fields: [{ name: "ownerId" }],
          },
          {
            name: "nftAssetCategoryIdIndex",
            fields: [{ name: "categoryId" }],
          },
        ],
      }
    );
  }
}
