<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import AwardIcon from '@lucide/svelte/icons/award';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import BoxIcon from '@lucide/svelte/icons/box';
	import BrainIcon from '@lucide/svelte/icons/brain';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import ChartNoAxesColumnIcon from '@lucide/svelte/icons/chart-no-axes-column';
	import ChartNoAxesCombinedIcon from '@lucide/svelte/icons/chart-no-axes-combined';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDotIcon from '@lucide/svelte/icons/circle-dot';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import CircleUserIcon from '@lucide/svelte/icons/circle-user';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import CodeIcon from '@lucide/svelte/icons/code';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import DotIcon from '@lucide/svelte/icons/dot';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import FileIcon from '@lucide/svelte/icons/file';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FlagIcon from '@lucide/svelte/icons/flag';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import FrownIcon from '@lucide/svelte/icons/frown';
	import GamepadIcon from '@lucide/svelte/icons/gamepad';
	import Gamepad2Icon from '@lucide/svelte/icons/gamepad-2';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import HeadphonesIcon from '@lucide/svelte/icons/headphones';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import HeartCrackIcon from '@lucide/svelte/icons/heart-crack';
	import HomeIcon from '@lucide/svelte/icons/home';
	import ImageIcon from '@lucide/svelte/icons/image';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ListIcon from '@lucide/svelte/icons/list';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import LockIcon from '@lucide/svelte/icons/lock';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';
	import MehIcon from '@lucide/svelte/icons/meh';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import MicIcon from '@lucide/svelte/icons/mic';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlayIcon from '@lucide/svelte/icons/play';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import ShuffleIcon from '@lucide/svelte/icons/shuffle';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import SmileIcon from '@lucide/svelte/icons/smile';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import SquareIcon from '@lucide/svelte/icons/square';
	import StarIcon from '@lucide/svelte/icons/star';
	import SunIcon from '@lucide/svelte/icons/sun';
	import TargetIcon from '@lucide/svelte/icons/target';
	import TrashIcon from '@lucide/svelte/icons/trash';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import UserIcon from '@lucide/svelte/icons/user';
	import UsersIcon from '@lucide/svelte/icons/users';
	import VideoIcon from '@lucide/svelte/icons/video';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import XIcon from '@lucide/svelte/icons/x';
	import ZapIcon from '@lucide/svelte/icons/zap';
	interface Props { name: string; size?: number; strokeWidth?: number; color?: string; class?: string; }
	let { name, size = 18, strokeWidth = 2, color = 'currentColor', class: className = '' }: Props = $props();
	// Keep existing semantic names while using the same icon family as T3 Code.
	const icons: Record<string, typeof CircleIcon> = {
		'chevron-down': ChevronDownIcon,
		'chevron-up': ChevronUpIcon,
		'chevron-left': ChevronLeftIcon,
		'chevron-right': ChevronRightIcon,
		'user': UserIcon,
		'circle-user': CircleUserIcon,
		'persona': CircleUserIcon,
		'bars': MenuIcon,
		'xmark': XIcon,
		'search': SearchIcon,
		'settings': SettingsIcon,
		'cloud': CloudIcon,
		'heart': HeartIcon,
		'affection': HeartIcon,
		'loneliness': HeartCrackIcon,
		'send': ArrowUpIcon,
		'trash': TrashIcon,
		'x': XIcon,
		'close': XIcon,
		'check': CheckIcon,
		'plus': PlusIcon,
		'play': PlayIcon,
		'minus': MinusIcon,
		'sun': SunIcon,
		'moon': MoonIcon,
		'camera': CameraIcon,
		'video': VideoIcon,
		'sliders': SlidersHorizontalIcon,
		'cube': BoxIcon,
		'headset': HeadphonesIcon,
		'lock-open': LockOpenIcon,
		'paperclip': PaperclipIcon,
		'mic': MicIcon,
		'volume': Volume2Icon,
		'image': ImageIcon,
		'upload': UploadIcon,
		'download': DownloadIcon,
		'save': SaveIcon,
		'copy': CopyIcon,
		'file': FileIcon,
		'file-text': FileTextIcon,
		'globe': GlobeIcon,
		'brain': BrainIcon,
		'code': CodeIcon,
		'database': DatabaseIcon,
		'monitor': MonitorIcon,
		'display': MonitorIcon,
		'layers': LayersIcon,
		'modules': BlocksIcon,
		'message': MessageSquareIcon,
		'message-square': MessageSquareIcon,
		'message-circle': MessageCircleIcon,
		'info': InfoIcon,
		'bell': BellIcon,
		'circle-help': CircleHelpIcon,
		'help-circle': CircleHelpIcon,
		'alert': TriangleAlertIcon,
		'warning': TriangleAlertIcon,
		'check-circle': CircleCheckIcon,
		'x-circle': CircleXIcon,
		'alert-circle': CircleAlertIcon,
		'smile': SmileIcon,
		'happy': SmileIcon,
		'meh': MehIcon,
		'neutral': MehIcon,
		'frown': FrownIcon,
		'sad': FrownIcon,
		'sparkles': SparklesIcon,
		'excited': SparklesIcon,
		'zap': ZapIcon,
		'energy': ZapIcon,
		'flame': FlameIcon,
		'fire': FlameIcon,
		'streak': FlameIcon,
		'trophy': TrophyIcon,
		'gamepad': GamepadIcon,
		'boredom': Gamepad2Icon,
		'target': TargetIcon,
		'milestone': FlagIcon,
		'chart': ChartNoAxesCombinedIcon,
		'stats': ChartNoAxesCombinedIcon,
		'bar-chart': ChartNoAxesColumnIcon,
		'clock': ClockIcon,
		'time': ClockIcon,
		'calendar': CalendarIcon,
		'star': StarIcon,
		'award': AwardIcon,
		'lock': LockIcon,
		'shield': ShieldIcon,
		'home': HomeIcon,
		'link': LinkIcon,
		'external-link': ExternalLinkIcon,
		'refresh-cw': RefreshCwIcon,
		'rotate-ccw': RotateCcwIcon,
		'refresh': RefreshCwIcon,
		'arrow-right': ArrowRightIcon,
		'trending-up': TrendingUpIcon,
		'book': BookOpenIcon,
		'compass': CompassIcon,
		'users': UsersIcon,
		'circle': CircleIcon,
		'dot': DotIcon,
		'circle-dot': CircleDotIcon,
		'list': ListIcon,
		'pencil': PencilIcon,
		'stop': SquareIcon,
		'loader': LoaderCircleIcon,
		'shuffle': ShuffleIcon,
	};
	const Glyph = $derived(icons[name] ?? CircleHelpIcon);
</script>

{#if name === 'github'}
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" fill={color} width={size} height={size} class={className} aria-hidden="true"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z" /></svg>
{:else}
	<Glyph {size} {color} stroke-width={strokeWidth} class={className} aria-hidden="true" style="flex-shrink: 0; vertical-align: middle;" />
{/if}
