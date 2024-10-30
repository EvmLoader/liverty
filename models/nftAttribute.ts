import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { nftAsset, nftAssetId } from "./nftAsset";

export interface nftAttributeAttributes {
  id: string;
  nftAssetId: string;
  traitType: string;
  value: string;
  displayType?: string;
}

export type nftAttributePk = "id";
export type nftAttributeId = nftAttribute[nftAttributePk];
export type nftAttributeOptionalAttributes = "id" | "displayType";
export type nftAttributeCreationAttributes = Optional<
  nftAttributeAttributes,
  nftAttributeOptionalAttributes
>;

export class nftAttribute
  extends Model<nftAttributeAttributes, nftAttributeCreationAttributes>
  implements nftAttributeAttributes
{
  id!: string;
  nftAssetId!: string;
  traitType!: string;
  value!: string;
  displayType?: string;

  // nftAttribute belongsTo nftAsset via nftAssetId
  nftAsset!: nftAsset;
  getNftAsset!: Sequelize.BelongsToGetAssociationMixin<nftAsset>;
  setNftAsset!: Sequelize.BelongsToSetAssociationMixin<nftAsset, nftAssetId>;
  createNftAsset!: Sequelize.BelongsToCreateAssociationMixin<nftAsset>;

  static initModel(sequelize: Sequelize.Sequelize): typeof nftAttribute {
    return nftAttribute.init(
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
        traitType: {
          type: DataTypes.STRING(191),
          allowNull: false,
          validate: {
            notEmpty: { msg: "traitType: Must not be empty" },
          },
        },
        value: {
          type: DataTypes.STRING(191),
          allowNull: false,
          validate: {
            notEmpty: { msg: "value: Must not be empty" },
          },
        },
        displayType: {
          type: DataTypes.STRING(191),
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: "nft_attribute",
        timestamps: false,
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
