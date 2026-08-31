import type { Meta, StoryObj } from '@storybook/react'
import {
  Button,
  IconButton,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Textarea,
  Badge,
  Separator,
  Spinner,
  Kbd,
  Progress,
  Avatar,
} from './index'
import { Plus, Trash2, Check, Settings } from 'lucide-react'

// ── Button ────────────────────────────────────────────────────────────────────

const buttonMeta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
  },
  args: { children: 'Botón', variant: 'primary', size: 'md' },
}
export default buttonMeta
type ButtonStory = StoryObj<typeof Button>

export const Primary: ButtonStory = { args: { variant: 'primary' } }
export const Secondary: ButtonStory = { args: { variant: 'secondary' } }
export const Ghost: ButtonStory = { args: { variant: 'ghost' } }
export const Danger: ButtonStory = { args: { variant: 'danger' } }
export const Sizes: ButtonStory = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button size="sm">Pequeño</Button>
      <Button size="md">Mediano</Button>
      <Button size="lg">Grande</Button>
    </div>
  ),
}
export const Loading: ButtonStory = { args: { loading: true, children: 'Guardando…' } }
export const WithIcons: ButtonStory = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Button leftIcon={<Plus size={16} />}>Añadir</Button>
      <Button variant="danger" leftIcon={<Trash2 size={16} />}>Eliminar</Button>
      <Button variant="secondary" rightIcon={<Check size={16} />}>Confirmar</Button>
    </div>
  ),
}

// ── IconButton ────────────────────────────────────────────────────────────────

export const Icon: StoryObj<typeof IconButton> = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <IconButton label="Configuración"><Settings size={16} /></IconButton>
      <IconButton label="Eliminar" variant="danger"><Trash2 size={16} /></IconButton>
    </div>
  ),
}

// ── Card ──────────────────────────────────────────────────────────────────────

export const CardExample: StoryObj<typeof Card> = {
  render: () => (
    <div style={{ maxWidth: 380 }}>
      <Card>
        <CardHeader>
          <CardTitle>Mi proyecto</CardTitle>
          <CardDescription>Una descripción breve de lo que contiene esta tarjeta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input placeholder="Nombre del proyecto" />
        </CardContent>
        <CardFooter>
          <Button variant="ghost">Cancelar</Button>
          <Button>Guardar</Button>
        </CardFooter>
      </Card>
    </div>
  ),
}

// ── Form ──────────────────────────────────────────────────────────────────────

export const Form: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Input placeholder="Email" type="email" />
      <Input placeholder="Contraseña" type="password" />
      <Textarea placeholder="Mensaje…" />
      <Button>Enviar</Button>
    </div>
  ),
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export const Badges: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge variant="neutral">Neutral</Badge>
      <Badge variant="primary">Primary</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="danger">Danger</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export const Misc: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 420 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Spinner size={16} />
        <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>Cargando…</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>Pulsa</span>
        <Kbd>⌘</Kbd>
        <span style={{ fontSize: 14 }}>+</span>
        <Kbd>K</Kbd>
      </div>
      <Progress value={66} />
      <Separator />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar name="Daya" size="md" />
        <Avatar name="Daya" size="sm" status="online" />
      </div>
    </div>
  ),
}
