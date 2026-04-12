import Svg, { Circle, Ellipse, Path } from "react-native-svg";

const FILL = "#FFFDF8";
const STROKE = "#D4C8B8";
const FACE = "#C4B0A0";
const RAIN = "#C4D8E8";

/** Sad cloud illustration for the golden-hour gate (camera). */
export function SadGateCloud() {
  return (
    <Svg width={180} height={120} viewBox="0 0 180 120">
      <Ellipse cx={90} cy={72} rx={58} ry={24} fill={FILL} />
      <Circle cx={46} cy={58} r={24} fill={FILL} />
      <Circle cx={90} cy={46} r={26} fill={FILL} />
      <Circle cx={134} cy={58} r={24} fill={FILL} />
      <Path
        d="M 26 72 C 26 48 42 34 58 32 C 62 18 82 16 90 28 C 98 16 118 18 124 32 C 142 34 156 50 154 70 C 156 84 140 96 90 98 C 40 96 26 86 26 72 Z"
        fill="none"
        stroke={STROKE}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={73} cy={66} r={3.5} fill={FACE} />
      <Circle cx={107} cy={66} r={3.5} fill={FACE} />
      <Path
        d="M 74 83 Q 90 71 106 83"
        fill="none"
        stroke={FACE}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Ellipse cx={72} cy={104} rx={2.8} ry={7} fill={RAIN} opacity={0.65} />
      <Ellipse cx={90} cy={108} rx={2.8} ry={9} fill={RAIN} opacity={0.7} />
      <Ellipse cx={108} cy={104} rx={2.8} ry={6.5} fill={RAIN} opacity={0.62} />
    </Svg>
  );
}
