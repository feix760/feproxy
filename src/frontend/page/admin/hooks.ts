import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './createStore';

export const useAppDispatch = () => useDispatch<AppDispatch>();

export const useAppSelector = useSelector.withTypes<RootState>();
