UPDATE products SET imagen = NULL WHERE imagen ILIKE 'data:%';

UPDATE products
SET imagenes = ARRAY(
  SELECT path FROM unnest(imagenes) WITH ORDINALITY AS images(path, position)
  WHERE path NOT ILIKE 'data:%'
  ORDER BY position
)
WHERE EXISTS (SELECT 1 FROM unnest(imagenes) AS images(path) WHERE path ILIKE 'data:%');

UPDATE products SET imagen = imagenes[1]
WHERE cardinality(imagenes) > 0 AND imagen IS DISTINCT FROM imagenes[1];
