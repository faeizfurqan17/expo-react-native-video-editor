import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { PlatformColor } from 'react-native';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#FFF',
          headerTitleStyle: { color: '#FFF' },
          contentStyle: { backgroundColor: '#000' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'Video Editor' }}
        />
        <Stack.Screen
          name="editor"
          options={{
            title: 'Edit Video',
            headerShown: false,
            presentation: 'fullScreenModal',
          }}
        />
        <Stack.Screen
          name="preview"
          options={{
            title: 'Preview',
            headerShown: false,
            presentation: 'fullScreenModal',
          }}
        />
      </Stack>
    </>
  );
}
