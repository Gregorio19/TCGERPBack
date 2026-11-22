DO $$
DECLARE
  doctor_id roles.id%TYPE;
  reference_count bigint;
BEGIN
  -- Bloquea nuevas asignaciones mediante la clave foránea mientras se comprueba el rol.
  SELECT id INTO doctor_id FROM roles WHERE nombre = 'doctor' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE NOTICE 'El rol doctor no existe.';
    RETURN;
  END IF;

  SELECT count(*) INTO reference_count FROM user_roles WHERE role_id = doctor_id;
  IF reference_count > 0 THEN
    RAISE NOTICE 'Se conserva el rol doctor: % asignaciones en user_roles.', reference_count;
    RETURN;
  END IF;

  DELETE FROM role_permissions WHERE role_id = doctor_id;
  DELETE FROM roles WHERE id = doctor_id;
  RAISE NOTICE 'Se eliminó el rol doctor y sus permisos.';
END
$$;
