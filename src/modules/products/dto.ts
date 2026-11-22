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

export const singleCardFields = z.object({
  nro_coleccionista: z.string().trim().min(1).max(50),
  rareza: RarityEnum,
  idioma: LanguageEnum,
  condicion: ConditionEnum,
});

const productFields = z.object({
  nombre: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().max(1000).nullable().optional(),
  sku: z.string().trim().max(50).regex(/^(?:[A-Z0-9-]+)?$/).optional(),
  juego: GameEnum.nullable().optional(),
  set: z.string().trim().nullable().optional(),
  tipo: ProductTypeEnum,
  precio: clpSchema.min(1).max(2147483647),
  precio_compra: clpSchema.max(2147483647).nullable().optional(),
  iva: z.number().int().min(0).max(100).optional(),
  stockMinimo: z.number().int().min(0).max(2147483647).optional(),
  categoria: z.string().trim().min(1),
});

// El tipo efectivo se valida en el servicio al editar, después de leer el producto.
const incomingCardFields = z.object({
  nro_coleccionista: z.unknown().optional(),
  rareza: z.unknown().optional(),
  idioma: z.unknown().optional(),
  condicion: z.unknown().optional(),
});

export const createProductDto = productFields.extend({
  tipo: ProductTypeEnum.default('sellado'),
  stock: z.number().int().min(0).max(2147483647).default(0),
  branchId: uuidSchema.optional(),
  initialCost: clpSchema.max(2147483647).optional(),
  activo: z.boolean().default(true),
}).merge(incomingCardFields).superRefine((data, ctx) => {
  if (data.tipo !== 'single') return;
  const result = singleCardFields.safeParse(data);
  if (!result.success) result.error.issues.forEach(issue => ctx.addIssue(issue));
});

export const updateProductDto = productFields.partial().merge(incomingCardFields)
  .extend({ nroColeccionista: z.unknown().optional() });

export const reorderProductImagesDto = z.object({
  imagenes: z.array(z.string().min(1)).max(4),
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
  stockMinimo: z.string().optional(), // Alias para stockDisponible solicitado por frontend
});

export const productIdParamDto = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

export const updateStockDto = z.object({
  stock: z.number().int().min(0),
});

