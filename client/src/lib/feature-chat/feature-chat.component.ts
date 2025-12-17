import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import { ChatMessage, User } from '@poalim/shared-interfaces';

@Component({
  selector: 'app-feature-chat',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './feature-chat.component.html',
  styleUrl: './feature-chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class FeatureChat {
  private readonly fb = inject(NonNullableFormBuilder);

  // Shared text/config (no hardcoded strings in the component)
  protected readonly uiText = UIText;
  protected readonly config = AppConfig;
  protected readonly chatUi = ChatUi;

  // Restore nickname after refresh
  private readonly storedUsername =
    localStorage.getItem(AppConfig.STORAGE_KEYS.USERNAME) ?? '';

  // Local state
  protected readonly username = signal<string>(this.storedUsername);
  protected readonly messages = signal<ChatMessage[]>([]);

  // UI toggle: login vs chat room
  protected readonly hasNickname = computed(() => {
    const name = this.username().trim();
    return name.length >= AppConfig.MIN_USERNAME_LENGTH;
  });

  // Current user derived from nickname
  protected readonly me = computed<User>(() => ({
    id: this.storedUsername || ChatUi.USER.DEFAULT_ID,
    username: this.username().trim(),
    isBot: false,
    color: ChatUi.USER.DEFAULT_COLOR,
  }));

  // Bot identity is constant
  protected readonly bot = computed<User>(() => ({
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  }));

  // Nickname form (typed, reactive)
  protected readonly nicknameForm = this.fb.group({
    username: this.fb.control(this.storedUsername, {
      validators: [
        Validators.required,
        Validators.minLength(AppConfig.MIN_USERNAME_LENGTH),
        Validators.maxLength(ChatUi.USER.MAX_USERNAME_LENGTH),
      ],
    }),
  });

  // Message input form (typed, reactive)
  protected readonly composerForm = this.fb.group({
    content: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.maxLength(AppConfig.MAX_MSG_LENGTH),
      ],
    }),
  });

  protected submitNickname(): void {
    // Standard UX: show validation errors on submit
    if (this.nicknameForm.invalid) {
      this.nicknameForm.markAllAsTouched();
      return;
    }

    const username = this.nicknameForm.controls.username.value.trim();

    // Handle "spaces only" edge case
    if (username.length < AppConfig.MIN_USERNAME_LENGTH) {
      this.nicknameForm.controls.username.setValue(username);
      this.nicknameForm.markAllAsTouched();
      return;
    }

    // Persist + update state
    localStorage.setItem(AppConfig.STORAGE_KEYS.USERNAME, username);
    this.username.set(username);

    // First entry only: bot greets the user
    if (this.messages().length === 0) {
      this.enqueueBotGreeting();
    }
  }

  protected send(): void {
    // No nickname, no chat
    if (!this.hasNickname()) return;

    if (this.composerForm.invalid) {
      this.composerForm.markAllAsTouched();
      return;
    }

    const content = this.composerForm.controls.content.value.trim();
    if (!content) return;

    // Build a message object that matches the shared interface
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.me(),
      content,
      timestamp: Date.now(),
      type: 'text',
    };

    // Append message + clear input
    this.messages.update((prev) => [...prev, msg]);
    this.composerForm.reset({ content: '' });
  }

  private enqueueBotGreeting(): void {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.bot(),
      content: UIText.BOT.DEFAULT_GREETING,
      timestamp: Date.now(),
      type: 'system',
    };

    // Small delay so it feels less "instant"
    window.setTimeout(() => {
      this.messages.update((prev) => [...prev, msg]);
    }, AppConfig.BOT_DELAY_MS);
  }

  formatChatTime(timestamp: number): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  // Helps Angular keep DOM nodes stable while list grows
  protected trackById = (_: number, m: ChatMessage) => m.id;
}
