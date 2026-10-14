import { Redirect } from 'expo-router';

// Keep older links usable after export moved directly into Settings.
export default function ExportDataRoute() {
  return <Redirect href="/settings" />;
}
