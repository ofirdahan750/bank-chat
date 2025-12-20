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
import { AppConfig, UI_TEXT } from '@poalim/constants';
import { ChatMessage, ReactionKey } from '@poalim/shared-interfaces';

export type EditSubmitEvent = { messageId: string; content: string };
export type ReactionToggleEvent = { messageId: string; reaction: ReactionKey };

@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './chat-bubble.component.html',
  styleUrl: './chat-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'animate.enter': 'anim-enter-bubble',
  },
})
export class ChatBubbleComponent implements OnChanges {
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);

  @Input({ required: true }) message!: ChatMessage;
  @Input({ required: true }) timeLabel!: string;
  @Input({ required: true }) meId!: string;

  @Input() isMine = false;
  @Input() canEdit = false;

  @Output() editSubmit = new EventEmitter<EditSubmitEvent>();
  @Output() reactionToggle = new EventEmitter<ReactionToggleEvent>();

  // Centralized copy (no free strings in template).
  protected readonly UI_TEXT = UI_TEXT;

  // Centralized config (max length etc.).
  protected readonly AppConfig = AppConfig;

  // Use the constant list directly (no extra types/mappers needed).
  protected readonly reactionOptions = UI_TEXT.CHAT_BUBBLE.REACTION_OPTIONS;

  readonly isEditing = signal(false);
  readonly showHistory = signal(false);

  readonly pulse = signal(false);
  private pulseTimer: number | null = null;
  private seenFirst = false;

  private readonly timeFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(
    undefined,
    { hour: '2-digit', minute: '2-digit' }
  );

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

    // Subtle visual feedback on updates (edit/reactions/bot overwrite).
    this.triggerPulse();
  }

  private triggerPulse(): void {
    if (this.pulseTimer !== null) {
      window.clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }

    // Restart CSS animation reliably.
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

    const next: string = this.editForm.controls.content.value.trim();
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
    const ids: string[] = this.message.reactions?.[key] ?? [];
    return !!this.meId && ids.includes(this.meId);
  }

  formatHistoryTime(ts: number): string {
    const date: Date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    return this.timeFormatter.format(date);
  }
}
