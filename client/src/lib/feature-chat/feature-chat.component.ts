import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
  OnInit,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import { ChatMessage } from '@poalim/shared-interfaces';
import { ChatBubbleComponent, EditSubmitEvent } from './chat-bubble/chat-bubble.component';
import { ChatStore } from './services/chat-store/chat-store.service';

@Component({
  selector: 'app-feature-chat',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, ChatBubbleComponent],
  templateUrl: './feature-chat.component.html',
  styleUrl: './feature-chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class FeatureChat implements OnInit {
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

  ngOnInit(): void {
    this.store.init();
  }

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

  protected onEditSubmit(e: EditSubmitEvent): void {
    this.store.editMessage(e.messageId, e.content);
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
