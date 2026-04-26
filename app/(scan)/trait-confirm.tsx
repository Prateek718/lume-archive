import { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { useScan } from '../../hooks/useScan';
import type { UserTrait } from '../../types';

type TraitKey = 'face_shape' | 'skin_undertone';

const FIELD_LABEL: Record<TraitKey, string> = {
  face_shape:     'Face shape',
  skin_undertone: 'Skin undertone',
};

const FACE_SHAPE_CYCLE = ['oval', 'round', 'square', 'heart', 'oblong'] as const;
const UNDERTONE_CYCLE  = ['warm', 'cool', 'neutral'] as const;

function cycleNext(current: string, options: readonly string[]): string {
  if (options.length === 0) return current;
  const idx = options.indexOf(current);
  const next = idx === -1 ? 0 : (idx + 1) % options.length;
  return options[next];
}

interface TraitRowProps {
  label:    string;
  value:    string;
  onChange: () => void;
  first?:   boolean;
  last?:    boolean;
}

function TraitRow({ label, value, onChange, first = false, last = false }: TraitRowProps) {
  return (
    <View
      style={{
        paddingVertical: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: first ? 1 : 0,
        borderTopColor: Palette.rule,
        borderBottomWidth: 1,
        borderBottomColor: Palette.rule,
        marginTop: first ? 0 : -1,
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <ChapterLabel style={{ marginBottom: 4 }}>{label}</ChapterLabel>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle: 'italic',
            fontSize: 22,
            color: Palette.ink,
          }}
        >
          {value}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onChange}
        style={{
          borderWidth: 1,
          borderColor: Palette.rule,
          borderRadius: 99,
          paddingVertical: 8,
          paddingHorizontal: 14,
        }}
      >
        <Text
          style={{
            fontFamily: 'Inter_500Medium',
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: Palette.ink2,
          }}
        >
          Change
        </Text>
      </TouchableOpacity>
      {last ? null : null}
    </View>
  );
}

export default function TraitConfirm() {
  const router = useRouter();
  const { partialScan, confirmTraits, state } = useScan();

  // Default each trait to its scan value; "Change" rotates to the alternative.
  const initialFaceShape  = (partialScan?.face_shape ?? '') as string;
  const initialUndertone  = (partialScan?.skin_undertone ?? '') as string;
  const altFaceShape      = partialScan?.alternatives?.face_shape ?? null;
  const altUndertone      = partialScan?.alternatives?.skin_undertone ?? null;

  const pendingFaceShape =
    !!partialScan?._pendingTraitDecisions?.confirmations.find(d => d.trait === 'face_shape') ||
    !!partialScan?._pendingTraitDecisions?.overrides.find(d => d.trait === 'face_shape');
  const pendingUndertone =
    !!partialScan?._pendingTraitDecisions?.confirmations.find(d => d.trait === 'skin_undertone') ||
    !!partialScan?._pendingTraitDecisions?.overrides.find(d => d.trait === 'skin_undertone');

  const rows = useMemo(() => {
    const items: TraitKey[] = [];
    if (pendingFaceShape) items.push('face_shape');
    if (pendingUndertone) items.push('skin_undertone');
    return items;
  }, [pendingFaceShape, pendingUndertone]);

  const [faceShape, setFaceShape] = useState<string>(initialFaceShape);
  const [undertone, setUndertone] = useState<string>(initialUndertone);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = () => {
    if (submitting) return;
    setSubmitting(true);
    const confirmations: Record<string, { value: string; source: UserTrait['source'] }> = {};
    if (pendingFaceShape && faceShape) {
      confirmations.face_shape = { value: faceShape, source: 'user_confirmed' };
    }
    if (pendingUndertone && undertone) {
      confirmations.skin_undertone = { value: undertone, source: 'user_confirmed' };
    }
    // Fire-and-forget: confirmTraits kicks off Gemini phase 2 (10-20s) and
    // updates state to 'success' or 'error' when done. Navigate immediately
    // so /scan's analyzing screen is what the user sees during the wait —
    // awaiting here would freeze trait-confirm with the button dimmed and
    // no progress indicator. confirmTraits handles errors internally.
    void confirmTraits(confirmations);
    router.replace('/scan');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingTop: 8, paddingHorizontal: 28 }}>
        <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 22, paddingBottom: 30 }}>
        <ChapterLabel>Before we continue</ChapterLabel>
        <View style={{ height: 14 }} />
        <Display>
          <Display italic>Does this</Display>
          {'\n'}look right?
        </Display>
        <View style={{ height: 18 }} />
        <Body serif size={14} style={{ fontStyle: 'italic', lineHeight: 22 }}>
          We read these traits from your scan. Correct anything that feels off — it shapes
          what comes next.
        </Body>

        <View style={{ height: 30 }} />
        {rows.map((key, idx) => {
          if (key === 'face_shape') {
            return (
              <TraitRow
                key="face_shape"
                label={FIELD_LABEL.face_shape}
                value={faceShape || '—'}
                onChange={() => {
                  // Prefer the model's alternative when available (toggle
                  // between primary and alternative). Fall back to cycling
                  // through the canonical face shape list.
                  if (altFaceShape && altFaceShape !== initialFaceShape) {
                    setFaceShape(prev =>
                      prev === initialFaceShape ? altFaceShape : initialFaceShape,
                    );
                  } else {
                    setFaceShape(prev => cycleNext(prev, FACE_SHAPE_CYCLE));
                  }
                }}
                first={idx === 0}
                last={idx === rows.length - 1}
              />
            );
          }
          return (
            <TraitRow
              key="skin_undertone"
              label={FIELD_LABEL.skin_undertone}
              value={undertone || '—'}
              onChange={() => {
                if (altUndertone && altUndertone !== initialUndertone) {
                  setUndertone(prev =>
                    prev === initialUndertone ? altUndertone : initialUndertone,
                  );
                } else {
                  setUndertone(prev => cycleNext(prev, UNDERTONE_CYCLE));
                }
              }}
              first={idx === 0}
              last={idx === rows.length - 1}
            />
          );
        })}

        <View style={{ flex: 1 }} />
        <PrimaryButton
          label="Looks right →"
          onPress={onSubmit}
          disabled={submitting || state === 'phase2'}
        />
      </View>
    </SafeAreaView>
  );
}
