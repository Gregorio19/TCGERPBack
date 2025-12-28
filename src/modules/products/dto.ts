import { z } from 'zod';
import { uuidSchema, clpSchema } from '../../lib/validation.js';

export const GameEnum = z.enum([
  'pokemon',
  'yugioh',
  'magic',
  'digimon',
  'one_piece',
  'dragon_ball',
  'naruto',
  'bleach',
  'final_fantasy',
  'card_fight_vanguard',
  'weiss_schwarz',
  'battle_spirits',
  'other',
]);

export const RarityEnum = z.enum([
  'comun',
  'infrecuente',
  'rara',
  'rara_holo',
  'rara_secreta',
  'rara_ultra',
  'rara_gold',
  'rara_rainbow',
  'rara_alternate',
  'rara_full_art',
  'rara_charizard',
  'legendary',
  'mythic',
]);

export const ConditionEnum = z.enum([
  'mint',
  'near_mint',
  'excellent',
  'very_good',
  'good',
  'fair',
  'poor',
  'damaged',
]);

export const LanguageEnum = z.enum([
  'espanol',
  'ingles',
  'japones',
  'chino',
  'koreano',
  'frances',
  'aleman',
  'italiano',
  'portugues',
  'ruso',
]);

export const ProductTypeEnum = z.enum(['single', 'sellado', 'bundle', 'collection']);

export const createProductDto = z
  .object({
    nombre: z.string().min(1).max(200),
    descripcion: z.string().max(1000).optional(),
    sku: z.string().max(50).regex(/^[A-Z0-9-]+$/).optional(),
    juego: GameEnum.optional(),
    set: z.string().optional(),
    nro_coleccionista: z.string().optional(),
    rareza: RarityEnum.optional(),
    idioma: LanguageEnum.optional(),
    condicion: ConditionEnum.optional(),
    tipo: ProductTypeEnum.optional(),
    precio: clpSchema.min(1),
    precio_compra: clpSchema.optional(),
    iva: z.number().int().min(0).max(100).default(19),
    stock: z.number().int().min(0),
    categoria: z.string().min(1),
    imagen: z.string().url().optional(),
    imagenes: z.array(z.string().url()).optional(),
    activo: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.tipo === 'single') {
        return (
          data.nro_coleccionista &&
          data.rareza &&
          data.condicion &&
          data.idioma
        );
      }
      return true;
    },
    {
      message: 'Productos tipo "single" requieren: nro_coleccionista, rareza, condicion, idioma',
    }
  );

export const updateProductDto = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().max(1000).optional(),
  sku: z.string().max(50).regex(/^[A-Z0-9-]+$/).optional(),
  juego: GameEnum.optional(),
  set: z.string().optional(),
  nro_coleccionista: z.string().optional(),
  rareza: RarityEnum.optional(),
  idioma: LanguageEnum.optional(),
  condicion: ConditionEnum.optional(),
  tipo: ProductTypeEnum.optional(),
  precio: clpSchema.min(1).optional(),
  precio_compra: clpSchema.optional(),
  iva: z.number().int().min(0).max(100).optional(),
  stock: z.number().int().min(0).optional(),
  categoria: z.string().min(1).optional(),
  imagen: z.string().url().optional(),
  imagenes: z.array(z.string().url()).optional(),
  activo: z.boolean().optional(),
});

export const listProductsQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  q: z.string().optional(),
  category: z.string().optional(),
  juego: GameEnum.optional(),
  rareza: RarityEnum.optional(),
  idioma: LanguageEnum.optional(),
  condicion: ConditionEnum.optional(),
  tipo: ProductTypeEnum.optional(),
  precioMin: z.string().optional(),
  precioMax: z.string().optional(),
  stockDisponible: z.string().optional(),
});

export const productIdParamDto = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

export const updateStockDto = z.object({
  stock: z.number().int().min(0),
});

