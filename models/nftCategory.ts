import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAsset, nftAssetId } from "./nftAsset";

export interface nftCategoryAttributes {
  id: string;
  name: string;
  description: string;
  image?: string;
  status: boolean;
  createdAt?: Date;
  deletedAt?: Date;
  updatedAt?: Date;
}

export type nftCategoryPk = "id";
export type nftCategoryId = nftCategory[nftCategoryPk];
export type nftCategoryOptionalAttributes =
  | "id"
  | "image"
  | "status"
  | "createdAt"
  | "deletedAt"
  | "updatedAt";
export type nftCategoryCreationAttributes = Optional<
  nftCategoryAttributes,
  nftCategoryOptionalAttributes
>;

export class nftCategory
  extends Model<nftCategoryAttributes, nftCategoryCreationAttributes>
  implements nftCategoryAttributes
{
  id!: string;
  name!: string;
  description!: string;
  image?: string;
  status!: boolean;
  createdAt?: Date;
  deletedAt?: Date;
  updatedAt?: Date;

  // nftCategory hasMany nftAsset via categoryId
  nftAssets!: nftAsset[];
  getNftAssets!: Sequelize.HasManyGetAssociationsMixin<nftAsset>;
  setNftAssets!: Sequelize.HasManySetAssociationsMixin<nftAsset, nftAssetId>;
  addNftAsset!: Sequelize.HasManyAddAssociationMixin<nftAsset, nftAssetId>;
  addNftAssets!: Sequelize.HasManyAddAssociationsMixin<nftAsset, nftAssetId>;
  createNftAsset!: Sequelize.HasManyCreateAssociationMixin<nftAsset>;
  removeNftAsset!: Sequelize.HasManyRemoveAssociationMixin<
    nftAsset,
    nftAssetId
  >;
  removeNftAssets!: Sequelize.HasManyRemoveAssociationsMixin<
    nftAsset,
    nftAssetId
  >;
  hasNftAsset!: Sequelize.HasManyHasAssociationMixin<nftAsset, nftAssetId>;
  hasNftAssets!: Sequelize.HasManyHasAssociationsMixin<nftAsset, nftAssetId>;
  countNftAssets!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftCategory {
    return nftCategory.init(
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
          allowNull: true,
          validate: {
            isUrl: { msg: "image: Must be a valid URL" },
          },
        },
        status: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          validate: {
            isBoolean: { msg: "status: Status must be a boolean value" },
          },
        },
      },
      {
        sequelize,
        tableName: "nft_category",
        timestamps: true,
        paranoid: true,
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
