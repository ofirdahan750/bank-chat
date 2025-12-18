import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import type { ChatMessage } from '@poalim/shared-interfaces';
import { ChatStore } from './services/feature-chat/feature-chat';
import { ChatBubbleComponent } from './chat-bubble/chat-bubble.component';

@Component({
  selector: 'app-feature-chat',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, ChatBubbleComponent],
  templateUrl: './feature-chat.component.html',
  styleUrl: './feature-chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class FeatureChat {
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly store = inject(ChatStore);

  protected readonly uiText = UIText;
  protected readonly config = AppConfig;
  protected readonly chatUi = ChatUi;

  protected readonly nicknameForm = this.fb.group({
    username: this.fb.control(this.store.username(), {
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

  protected readonly botTypingMessage = (): ChatMessage => ({
    id: 'bot-typing',
    sender: this.store.bot(),
    content: `${this.config.BOT_NAME} ${this.uiText.CHAT.TYPING}`,
    timestamp: Date.now(),
    type: 'system',
  });

  protected submitNickname(): void {
    if (this.nicknameForm.invalid) {
      this.nicknameForm.markAllAsTouched();
      return;
    }

    this.store.submitNickname(this.nicknameForm.controls.username.value);
  }

  protected send(): void {
    if (this.composerForm.invalid) {
      this.composerForm.markAllAsTouched();
      return;
    }

    this.store.send(this.composerForm.controls.content.value);
    this.composerForm.reset({ content: '' });
  }

  protected formatChatTime(timestamp: number): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  protected trackById = (_: number, m: ChatMessage) => m.id;
}
