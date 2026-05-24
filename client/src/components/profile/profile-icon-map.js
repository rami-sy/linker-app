import React from "react";
import FeIcon from "@expo/vector-icons/Feather";
import {
  Bell,
  Camera,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  ChatTeardropText,
  CheckCircle,
  DeviceMobile,
  Eye,
  FileText,
  GearSix,
  GlobeHemisphereWest,
  HeartStraight,
  ImageSquare,
  Info,
  LockKey,
  MapPin,
  Moon,
  Phone,
  ShieldCheck,
  SignOut,
  Sun,
  Trash,
  TrashSimple,
  UserCircle,
  UsersThree,
  XCircle,
} from "phosphor-react-native";

const ICON_MAP = {
  user: UserCircle,
  users: UsersThree,
  lock: LockKey,
  shield: ShieldCheck,
  settings: GearSix,
  "log-out": SignOut,
  image: ImageSquare,
  info: Info,
  heart: HeartStraight,
  "map-pin": MapPin,
  globe: GlobeHemisphereWest,
  eye: Eye,
  "file-text": FileText,
  "message-square": ChatTeardropText,
  "message-circle": ChatCircleDots,
  phone: Phone,
  smartphone: DeviceMobile,
  mail: FeIcon,
  trash: Trash,
  "trash-2": TrashSimple,
  bell: Bell,
  sun: Sun,
  moon: Moon,
  camera: Camera,
  "check-circle": CheckCircle,
  "x-circle": XCircle,
  "chevron-down": CaretDown,
  "chevron-left": CaretLeft,
  "chevron-right": CaretRight,
};

export const ProfileGlyph = ({
  name,
  size = 20,
  color = "#94a3b8",
  weight = "duotone",
}) => {
  const Icon = ICON_MAP[name];
  if (!Icon) {
    return <FeIcon name={name} size={size} color={color} />;
  }
  if (Icon === FeIcon) {
    return <FeIcon name={name} size={size} color={color} />;
  }
  return <Icon size={size} color={color} weight={weight} />;
};

