import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  formData: {
    firstName: "",
    lastName: "",
    birthDate: { month: "", day: "", year: "" },
    gender: "",
    bio: "",
    maritalStatus: "",
  },
  errors: {},
  isLoading: false,
};

const formSlice = createSlice({
  name: "form",
  initialState,
  reducers: {
    setFormData: (state, action) => {
      state.formData = { ...state.formData, ...action.payload };
    },
    setErrors: (state, action) => {
      state.errors = action.payload;
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    resetForm: (state) => {
      state.formData = initialState.formData;
      state.errors = {};
      state.isLoading = false;
    },
  },
});

export const { setFormData, setErrors, setLoading, resetForm } =
  formSlice.actions;

export const selectFormData = (state) => state.form.formData;
export const selectFormErrors = (state) => state.form.errors;
export const selectIsLoading = (state) => state.form.isLoading;

export default formSlice.reducer;
