import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppConfig } from '@poalim/constants';
import { ChatMessage, ReactionKey } from '@poalim/shared-interfaces';

export type EditSubmitEvent = { messageId: string; content: string };
export type ReactionToggleEvent = { messageId: string; reaction: ReactionKey };

type ReactionOption = {
  key: ReactionKey;
  emoji: string;
  label: string;
};

@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './chat-bubble.component.html',
  styleUrl: './chat-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    // Works with Angular 20+ compiler animations API (no BrowserAnimationsModule)
    'animate.enter': 'anim-enter-bubble',
  },
})
export class ChatBubbleComponent implements OnChanges {
  private readonly fb = inject(NonNullableFormBuilder);

  @Input({ required: true }) message!: ChatMessage;
  @Input({ required: true }) timeLabel!: string;
  @Input({ required: true }) meId!: string;

  @Input() isMine = false;
  @Input() canEdit = false;

  @Output() editSubmit = new EventEmitter<EditSubmitEvent>();
  @Output() reactionToggle = new EventEmitter<ReactionToggleEvent>();

  readonly isEditing = signal(false);
  readonly showHistory = signal(false);

  readonly pulse = signal(false);
  private pulseTimer: number | null = null;
  private seenFirst = false;

  protected readonly AppConfig = AppConfig;

  readonly reactionOptions: readonly ReactionOption[] = [
    { key: 'like', emoji: '👍', label: 'Like' },
    { key: 'heart', emoji: '❤️', label: 'Heart' },
    { key: 'laugh', emoji: '😂', label: 'Laugh' },
    { key: 'wow', emoji: '😮', label: 'Wow' },
    { key: 'sad', emoji: '😢', label: 'Sad' },
  ] as const;

  readonly editForm = this.fb.group({
    content: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.maxLength(AppConfig.MAX_MSG_LENGTH),
      ],
    }),
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['message']) return;

    if (!this.seenFirst) {
      this.seenFirst = true;
      return;
    }

    // Subtle "feedback" pulse on updates (edit/reactions/bot overwrite)
    this.triggerPulse();
  }

  private triggerPulse(): void {
    if (this.pulseTimer !== null) {
      window.clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }

    // restart CSS animation reliably
    this.pulse.set(false);
    queueMicrotask(() => this.pulse.set(true));

    this.pulseTimer = window.setTimeout(() => {
      this.pulse.set(false);
      this.pulseTimer = null;
    }, 420);
  }

  startEdit(): void {
    this.editForm.controls.content.setValue(this.message.content);
    this.isEditing.set(true);
    this.showHistory.set(false);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editForm.reset({ content: '' });
  }

  saveEdit(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const next = this.editForm.controls.content.value.trim();
    if (!next || next === this.message.content.trim()) {
      this.cancelEdit();
      return;
    }

    this.editSubmit.emit({ messageId: this.message.id, content: next });
    this.isEditing.set(false);
  }

  toggleHistory(): void {
    this.showHistory.set(!this.showHistory());
  }

  toggleReaction(key: ReactionKey): void {
    this.reactionToggle.emit({ messageId: this.message.id, reaction: key });
  }

  reactionCount(key: ReactionKey): number {
    return (this.message.reactions?.[key] ?? []).length;
  }

  hasReacted(key: ReactionKey): boolean {
    const ids = this.message.reactions?.[key] ?? [];
    return !!this.meId && ids.includes(this.meId);
  }

  formatHistoryTime(ts: number): string {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
