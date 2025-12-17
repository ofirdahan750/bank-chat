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
import { ChatTimePipe } from '@poalim/shared-interfaces';

@Component({
  selector: 'app-feature-chat',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, ChatTimePipe],
  templateUrl: './feature-chat.component.html',
  styleUrl: './feature-chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class FeatureChat {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly uiText = UIText;
  protected readonly config = AppConfig;
  protected readonly chatUi = ChatUi;

  private readonly storedUsername =
    localStorage.getItem(AppConfig.STORAGE_KEYS.USERNAME) ?? '';

  protected readonly username = signal<string>(this.storedUsername);
  protected readonly messages = signal<ChatMessage[]>([]);

  protected readonly hasNickname = computed(
    () => this.username().trim().length >= AppConfig.MIN_USERNAME_LENGTH
  );

  protected readonly me = computed<User>(() => ({
    id: this.storedUsername ? this.storedUsername : ChatUi.USER.DEFAULT_ID,
    username: this.username().trim(),
    isBot: false,
    color: ChatUi.USER.DEFAULT_COLOR,
  }));

  protected readonly bot = computed<User>(() => ({
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  }));

  protected readonly nicknameForm = this.fb.group({
    username: this.fb.control(this.storedUsername, {
      validators: [
        Validators.required,
        Validators.minLength(AppConfig.MIN_USERNAME_LENGTH),
        Validators.maxLength(ChatUi.USER.MAX_USERNAME_LENGTH),
      ],
    }),
  });

  protected readonly composerForm = this.fb.group({
    content: this.fb.control('', {
      validators: [
        Validators.required,
        Validators.maxLength(AppConfig.MAX_MSG_LENGTH),
      ],
    }),
  });

  protected submitNickname(): void {
    if (this.nicknameForm.invalid) {
      this.nicknameForm.markAllAsTouched();
      return;
    }

    const username = this.nicknameForm.controls.username.value.trim();
    if (username.length < AppConfig.MIN_USERNAME_LENGTH) {
      this.nicknameForm.controls.username.setValue(username);
      this.nicknameForm.markAllAsTouched();
      return;
    }

    localStorage.setItem(AppConfig.STORAGE_KEYS.USERNAME, username);
    this.username.set(username);

    if (this.messages().length === 0) {
      this.enqueueBotGreeting();
    }
  }

  protected send(): void {
    if (!this.hasNickname()) return;

    if (this.composerForm.invalid) {
      this.composerForm.markAllAsTouched();
      return;
    }

    const content = this.composerForm.controls.content.value.trim();
    if (!content) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.me(),
      content,
      timestamp: Date.now(),
      type: 'text',
    };

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

    window.setTimeout(() => {
      this.messages.update((prev) => [...prev, msg]);
    }, AppConfig.BOT_DELAY_MS);
  }

  protected trackById = (_: number, m: ChatMessage) => m.id;
}
