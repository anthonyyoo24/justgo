// PROTOTYPE ONLY (Phase 16 Appendix A). Not for main.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSuperwall, useSuperwallEvents } from 'expo-superwall';

const USER = '7f1d6c2e-4b8a-4c7e-9a1f-2b3c4d5e6f70';

export function SuperwallProto() {
  const sw = useSuperwall();
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => {
    console.log(`[SWPROTO] ${line}`);
    setLog((l) => [...l.slice(-7), line.slice(0, 220)]);
  };
  useSuperwallEvents({
    onSuperwallEvent: (info) => {
      const e = info.event as { event?: string; transaction?: unknown };
      if (e.event === 'transactionComplete' || e.event === 'transactionStart' || e.event === 'freeTrialStart')
        add(`event ${e.event} ${JSON.stringify(e.transaction ?? null)}`);
    },
  });
  const run = (name: string, fn: () => Promise<unknown>) => () => {
    fn().then(
      (r) => add(`${name} -> ${JSON.stringify(r)}`),
      (e: unknown) => add(`${name} ! ${String(e)}`),
    );
  };
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 8, right: 8, bottom: 40, backgroundColor: '#000c', padding: 8, borderRadius: 8 }}
    >
      <Text testID="sw-status" style={{ color: '#fff', fontSize: 11 }}>
        SW configured={String(sw.isConfigured)} loading={String(sw.isLoading)} error={sw.configurationError ?? 'none'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 }}>
        {[
          ['identify', () => sw.identify(USER)],
          ['buy annual', () => sw.purchase('com.anthonyyoo.justgo.pro.annual')],
          ['buy monthly', () => sw.purchase('com.anthonyyoo.justgo.pro.monthly')],
          ['customerInfo', () => sw.getCustomerInfo()],
          ['restore', () => sw.restorePurchases()],
        ].map(([label, fn]) => (
          <Pressable key={label as string} onPress={run(label as string, fn as () => Promise<unknown>)} style={{ backgroundColor: '#fff', padding: 6, borderRadius: 4 }}>
            <Text style={{ fontSize: 12 }}>{label as string}</Text>
          </Pressable>
        ))}
      </View>
      {log.map((l, i) => (
        <Text key={i} style={{ color: '#9f9', fontSize: 9 }}>{l}</Text>
      ))}
    </View>
  );
}
