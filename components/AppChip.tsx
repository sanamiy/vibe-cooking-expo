import { theme } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  label: string;
  color?: string;
  backgroundColor?: string;
}

export const AppChip = ({ label, color = '#fff', backgroundColor = theme.colors.primary }: Props) => {
  return (
    <View style={[styles.chip, { backgroundColor }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
