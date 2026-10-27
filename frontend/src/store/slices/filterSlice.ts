import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { JobsQueryParams, WorkplaceType, EmploymentType, SalaryInterval } from '../../types/api';

const initialState: JobsQueryParams = {
  search: '',
  workplaceType: '',
  employmentType: '',
  country: '',
  company: '',
  postedWithin: undefined,
  isRemote: false,
  hasSalary: false,
  salaryMin: undefined,
  salaryInterval: undefined,
  sortBy: 'publishedAt',
  sortOrder: 'desc',
  page: 1,
  pageSize: 25,
};

export const filterSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setSearch: (state, action: PayloadAction<string>) => {
      state.search = action.payload;
      state.page = 1;
    },
    setCompany: (state, action: PayloadAction<string>) => {
      state.company = action.payload;
      state.page = 1;
    },
    setPostedWithin: (state, action: PayloadAction<'1d' | '7d' | '30d' | undefined>) => {
      state.postedWithin = action.payload;
      state.page = 1;
    },
    setIsRemote: (state, action: PayloadAction<boolean>) => {
      state.isRemote = action.payload;
      state.page = 1;
    },
    setWorkplaceType: (state, action: PayloadAction<WorkplaceType | ''>) => {
      state.workplaceType = action.payload;
      state.page = 1;
    },
    setEmploymentType: (state, action: PayloadAction<EmploymentType | ''>) => {
      state.employmentType = action.payload;
      state.page = 1;
    },
    setCountry: (state, action: PayloadAction<string>) => {
      state.country = action.payload;
      state.page = 1;
    },
    setHasSalary: (state, action: PayloadAction<boolean>) => {
      state.hasSalary = action.payload;
      state.page = 1;
    },
    setSalaryMin: (state, action: PayloadAction<number | undefined>) => {
      state.salaryMin = action.payload;
      state.page = 1;
    },
    setSalaryInterval: (state, action: PayloadAction<SalaryInterval>) => {
      state.salaryInterval = action.payload;
      state.page = 1;
    },
    setSort: (state, action: PayloadAction<{ sortBy: JobsQueryParams['sortBy']; sortOrder: 'asc' | 'desc' }>) => {
      state.sortBy = action.payload.sortBy;
      state.sortOrder = action.payload.sortOrder;
      state.page = 1;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.page = action.payload;
    },
    setPageSize: (state, action: PayloadAction<number>) => {
      state.pageSize = action.payload;
      state.page = 1;
    },
    resetFilters: () => {
      return initialState;
    },
    syncFromUrl: (state, action: PayloadAction<Partial<JobsQueryParams>>) => {
      return { ...state, ...action.payload };
    }
  },
});

export const {
  setSearch,
  setCompany,
  setPostedWithin,
  setIsRemote,
  setWorkplaceType,
  setEmploymentType,
  setCountry,
  setHasSalary,
  setSalaryMin,
  setSalaryInterval,
  setSort,
  setPage,
  setPageSize,
  resetFilters,
  syncFromUrl,
} = filterSlice.actions;

export default filterSlice.reducer;
