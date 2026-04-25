import type { ComponentType, SVGProps } from 'react'
import {
  AlertTriangle,
  BookMarked,
  Boxes,
  Braces,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Columns3,
  Copy,
  Database,
  Download,
  FilePlus2,
  FolderTree,
  Gauge,
  History,
  KeyRound,
  Layers3,
  Lock,
  Moon,
  Palette,
  PanelBottom,
  PencilLine,
  Play,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  Table2,
  X,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'

type IconProps = SVGProps<SVGSVGElement>
type IconComponent = ComponentType<LucideProps>

function adapt(Icon: IconComponent) {
  return function WorkbenchIcon(props: IconProps) {
    return <Icon aria-hidden="true" strokeWidth={1.7} {...props} />
  }
}

export const LogoMark = adapt(Boxes)
export const ConnectionsIcon = adapt(Server)
export const EnvironmentsIcon = adapt(Layers3)
export const ExplorerIcon = adapt(FolderTree)
export const SavedWorkIcon = adapt(BookMarked)
export const SearchIcon = adapt(Search)
export const SettingsIcon = adapt(Settings)
export const ThemeIcon = adapt(Moon)
export const LockIcon = adapt(Lock)
export const ChevronRightIcon = adapt(ChevronRight)
export const ChevronDownIcon = adapt(ChevronDown)
export const PanelIcon = adapt(PanelBottom)
export const RenameIcon = adapt(PencilLine)
export const PlayIcon = adapt(Play)
export const StopIcon = adapt(CircleStop)
export const RefreshIcon = adapt(RefreshCw)
export const CloseIcon = adapt(X)
export const PlusIcon = adapt(FilePlus2)
export const DatabaseIcon = adapt(Database)
export const WarningIcon = adapt(AlertTriangle)
export const ExplainIcon = adapt(Gauge)
export const FavoriteIcon = adapt(Star)
export const ReadOnlyIcon = adapt(ShieldCheck)
export const TableIcon = adapt(Table2)
export const JsonIcon = adapt(Braces)
export const ColumnIcon = adapt(Columns3)
export const KeyValueIcon = adapt(KeyRound)
export const LightThemeIcon = adapt(Sun)
export const CopyIcon = adapt(Copy)
export const DownloadIcon = adapt(Download)
export const SaveIcon = adapt(Save)
export const HistoryIcon = adapt(History)
export const ColorIcon = adapt(Palette)
