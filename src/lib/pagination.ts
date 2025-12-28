export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const parsePagination = (query: Record<string, string | undefined>): PaginationParams => {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(query.limit || query.pageSize || '25', 10)));
  const sortBy = query.sortBy;
  const sortDir = (query.sortOrder || query.sortDir || 'asc') as 'asc' | 'desc';
  const search = query.search || query.q;

  return {
    page,
    pageSize,
    sortBy,
    sortDir,
    search,
  };
};

export const buildPaginatedResponse = <T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> => {
  const totalPages = Math.ceil(total / pageSize);

  return {
    data,
    pagination: {
      page,
      limit: pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

