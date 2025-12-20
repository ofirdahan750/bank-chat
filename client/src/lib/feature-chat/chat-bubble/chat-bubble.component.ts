import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppConfig, UI_TEXT } from '@poalim/constants';
import {
  ChatMessage,
  EditSubmitEvent,
  ReactionKey,
  ReactionToggleEvent,
} from '@poalim/shared-interfaces';
import { ChatBubbleEditForm } from './chat-bubble.types';

@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, NgClass],
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

  @ViewChild('bubbleEl', { static: true })
  private readonly bubbleEl!: ElementRef<HTMLElement>;

  @Input({ required: true }) message!: ChatMessage;
  @Input({ required: true }) timeLabel!: string;
  @Input({ required: true }) meId!: string;

  @Input() isMine: boolean = false;
  @Input() canEdit: boolean = false;

  @Output() editSubmit: EventEmitter<EditSubmitEvent> =
    new EventEmitter<EditSubmitEvent>();

  @Output() reactionToggle: EventEmitter<ReactionToggleEvent> =
    new EventEmitter<ReactionToggleEvent>();

  // Centralized copy (no free strings in template).
  protected readonly UI_TEXT = UI_TEXT;

  // Centralized config (max length etc.).
  protected readonly AppConfig = AppConfig;

  // Use the constant list directly (no extra local types/mappers).
  protected readonly reactionOptions = UI_TEXT.CHAT_BUBBLE.REACTION_OPTIONS;

  protected readonly isEditing = signal(false);
  protected readonly showHistory = signal(false);

  private readonly timeFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(
    undefined,
    { hour: '2-digit', minute: '2-digit' }
  );

  protected readonly editForm: ChatBubbleEditForm = this.fb.group({
    content: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.maxLength(AppConfig.MAX_MSG_LENGTH),
      ],
    }),
  });

  ngOnChanges(changes: SimpleChanges): void {
    const messageChange = changes['message'];
    if (!messageChange || messageChange.firstChange) return;

    // Visual feedback when the message object updates (edits/reactions/bot overwrite).
    this.restartPulseAnimation();
  }

  private restartPulseAnimation(): void {
    // Restart the CSS animation without timers/microtasks.
    const el: HTMLElement = this.bubbleEl.nativeElement;

    el.classList.remove('chat-bubble--pulse');

    // Force reflow so the browser "sees" the removal before re-adding.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void el.offsetWidth;

    el.classList.add('chat-bubble--pulse');
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
    return Boolean(this.meId && ids.includes(this.meId));
  }

  formatHistoryTime(ts: number): string {
    const date: Date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    return this.timeFormatter.format(date);
  }
}
