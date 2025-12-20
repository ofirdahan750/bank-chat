import { FormControl, FormGroup } from '@angular/forms';

export type ChatBubbleEditForm = FormGroup<{
  content: FormControl<string>;
}>;
