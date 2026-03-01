import { theme } from "@/constants/theme";
import { DialogueState } from "@/hooks/useVoiceDialogue";
import { AudioDevice } from "@/hooks/useAudioDevices";
import type { VoiceInputMode } from "@/hooks/useVoiceCommands";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState } from "react";

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

interface VoiceDialoguePanelProps {
  dialogueState: DialogueState;
  conversationHistory: ConversationEntry[];
  lastResponse: string;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  onSelectInput: (id: string) => void;
  onSelectOutput: (id: string) => void;
  showVoiceAlgorithmSelector?: boolean;
  selectedVoiceInputMode?: VoiceInputMode;
  onSelectVoiceInputMode?: (mode: VoiceInputMode) => void;
}

const stateLabels: Record<DialogueState, { icon: string; text: string }> = {
  listening: { icon: "🎤", text: "聞いています..." },
  processing: { icon: "🤔", text: "考えています..." },
  speaking: { icon: "🔊", text: "話しています..." },
  interrupted: { icon: "✋", text: "割り込み中..." },
};

function DevicePicker({
  label,
  icon,
  devices,
  selectedId,
  onSelect,
}: {
  label: string;
  icon: string;
  devices: AudioDevice[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS !== "web" || devices.length === 0) return null;

  const selected = devices.find((d) => d.deviceId === selectedId) ?? devices[0];

  return (
    <View style={pickerStyles.wrapper}>
      <Pressable style={pickerStyles.button} onPress={() => setOpen(!open)}>
        <Text style={pickerStyles.icon}>{icon}</Text>
        <Text style={pickerStyles.label} numberOfLines={1}>
          {label}: {selected?.label ?? "デフォルト"}
        </Text>
        <Text style={pickerStyles.arrow}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open && (
        <View style={pickerStyles.dropdown}>
          {devices.map((d) => (
            <Pressable
              key={d.deviceId}
              style={[
                pickerStyles.option,
                d.deviceId === selectedId && pickerStyles.optionSelected,
              ]}
              onPress={() => {
                onSelect(d.deviceId);
                setOpen(false);
              }}
            >
              <Text
                style={[
                  pickerStyles.optionText,
                  d.deviceId === selectedId && pickerStyles.optionTextSelected,
                ]}
                numberOfLines={1}
              >
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function VoiceDialoguePanel({
  dialogueState,
  conversationHistory,
  lastResponse,
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onSelectInput,
  onSelectOutput,
  showVoiceAlgorithmSelector = false,
  selectedVoiceInputMode = "voxtral_speech_understanding",
  onSelectVoiceInputMode,
}: VoiceDialoguePanelProps) {
  const state = stateLabels[dialogueState];

  return (
    <View style={styles.container}>
      {/* Device selectors */}
      <View style={styles.deviceRow}>
        <DevicePicker
          label="入力"
          icon="🎙️"
          devices={inputDevices}
          selectedId={selectedInputId}
          onSelect={onSelectInput}
        />
        <DevicePicker
          label="出力"
          icon="🔈"
          devices={outputDevices}
          selectedId={selectedOutputId}
          onSelect={onSelectOutput}
        />
      </View>

      {showVoiceAlgorithmSelector ? (
        <View style={styles.modeSelectorCard}>
          <Text style={styles.modeSelectorLabel}>音声認識アルゴリズム</Text>
          <View style={styles.modeSelectorRow}>
            <Pressable
              style={[
                styles.modeButton,
                selectedVoiceInputMode === "voxtral_dialogue" &&
                  styles.modeButtonSelected,
              ]}
              onPress={() => onSelectVoiceInputMode?.("voxtral_dialogue")}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  selectedVoiceInputMode === "voxtral_dialogue" &&
                    styles.modeButtonTextSelected,
                ]}
              >
                音声LLM対話
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.modeButton,
                selectedVoiceInputMode === "voxtral_speech_understanding" &&
                  styles.modeButtonSelected,
              ]}
              onPress={() =>
                onSelectVoiceInputMode?.("voxtral_speech_understanding")
              }
            >
              <Text
                style={[
                  styles.modeButtonText,
                  selectedVoiceInputMode === "voxtral_speech_understanding" &&
                    styles.modeButtonTextSelected,
                ]}
              >
                音声LLM
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.modeButton,
                selectedVoiceInputMode === "asr_then_llm" &&
                  styles.modeButtonSelected,
              ]}
              onPress={() => onSelectVoiceInputMode?.("asr_then_llm")}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  selectedVoiceInputMode === "asr_then_llm" &&
                    styles.modeButtonTextSelected,
                ]}
              >
                ASR → LLM
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.stateRow}>
        <View
          style={[
            styles.stateBadge,
            dialogueState === "listening" && styles.stateBadgeListening,
            dialogueState === "processing" && styles.stateBadgeProcessing,
            dialogueState === "speaking" && styles.stateBadgeSpeaking,
            dialogueState === "interrupted" && styles.stateBadgeInterrupted,
          ]}
        >
          <Text style={styles.stateIcon}>{state.icon}</Text>
          <Text style={styles.stateText}>{state.text}</Text>
        </View>
      </View>

      {lastResponse ? (
        <View style={styles.responseBox}>
          <Text style={styles.responseText}>{lastResponse}</Text>
        </View>
      ) : null}

      {conversationHistory.length > 1 && (
        <ScrollView style={styles.historyScroll} nestedScrollEnabled>
          {conversationHistory.slice(-6).map((entry, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                entry.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  entry.role === "user"
                    ? styles.userBubbleText
                    : styles.aiBubbleText,
                ]}
              >
                {entry.content}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: "relative" as any,
    zIndex: 10,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  icon: {
    fontSize: 14,
  },
  label: {
    fontSize: 12,
    color: theme.colors.text,
    fontWeight: "600",
    flex: 1,
  },
  arrow: {
    fontSize: 10,
    color: theme.colors.subText,
  },
  dropdown: {
    position: "absolute" as any,
    top: 42,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 100,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  optionSelected: {
    backgroundColor: theme.colors.info,
  },
  optionText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  optionTextSelected: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 10,
    overflow: "visible" as any,
  },
  deviceRow: {
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
    overflow: "visible" as any,
  },
  stateRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  modeSelectorCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 10,
    gap: 8,
  },
  modeSelectorLabel: {
    fontSize: 12,
    color: theme.colors.subText,
    fontWeight: "700",
  },
  modeSelectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: theme.colors.card,
  },
  modeButtonSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.info,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
  },
  modeButtonTextSelected: {
    color: theme.colors.primary,
  },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg,
  },
  stateBadgeListening: {
    backgroundColor: "#EAF6FF",
  },
  stateBadgeProcessing: {
    backgroundColor: "#FFF8E1",
  },
  stateBadgeSpeaking: {
    backgroundColor: "#E8F5E9",
  },
  stateBadgeInterrupted: {
    backgroundColor: "#FFF3E0",
  },
  stateIcon: {
    fontSize: 20,
  },
  stateText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    fontFamily: "M PLUS Rounded 1c",
  },
  responseBox: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 16,
  },
  responseText: {
    fontSize: 16,
    lineHeight: 26,
    color: theme.colors.text,
    fontFamily: "M PLUS Rounded 1c",
  },
  historyScroll: {
    maxHeight: 200,
  },
  bubble: {
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 8,
    maxWidth: "85%",
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    alignSelf: "flex-end",
  },
  aiBubble: {
    backgroundColor: theme.colors.info,
    alignSelf: "flex-start",
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 22,
  },
  userBubbleText: {
    color: "#fff",
  },
  aiBubbleText: {
    color: theme.colors.text,
  },
});
