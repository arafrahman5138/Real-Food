import React from 'react';
import { BrowseView } from '../../components/MealsTab/BrowseView';

/**
 * Standalone /browse route — delegates entirely to the shared BrowseView
 * component so we maintain a single source of truth.
 */
export default function BrowseScreen() {
  return <BrowseView />;
}
