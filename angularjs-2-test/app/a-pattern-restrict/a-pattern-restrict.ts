import { Directive, Input, HostListener, ElementRef } from '@angular/core';

@Directive({
  selector: '[a-pattern-restrict]'
})
export class APatternRestrict {
  private oldValue: string;
  private caretPosition: number;

  constructor(private el: ElementRef) {
    //TODO set regExp cache on pattern

    //DEBUG && showDebugInfo("Initializing");
    this.oldValue = el.nativeElement.val();
    if (!this.oldValue) this.oldValue = '';
    //DEBUG && showDebugInfo("Original value:", oldValue);

    this.detectGetCaretPositionMethods();
    this.detectSetCaretPositionMethods();
  }

  @Input() pattern: string;

  @HostListener('input keyup click') genericEventHandler(evt: Event) {
      //HACK Chrome returns an empty string as value if user inputs a non-numeric string into a number type input
      // and this may happen with other non-text inputs soon enough. As such, if getting the string only gives us an
      // empty string, we don't have the chance of validating it against a regex. All we can do is assume it's wrong,
      // since the browser is rejecting it either way.

      var iElement = this.el.nativeElement;
      let newValue = iElement.val();
      let inputValidity = iElement.prop('validity');

      if (newValue === '' && iElement.attr('type') !== 'text' && inputValidity && inputValidity.badInput) {
        //DEBUG && showDebugInfo("Value cannot be verified. Should be invalid. Reverting back to:", oldValue);
        evt.preventDefault();
        this.revertToPreviousValue();
      } else if (newValue === "" && this.getValueLengthThroughSelection(<ElementRef>iElement) !== 0) {
        //DEBUG && showDebugInfo("Invalid input. Reverting back to:", oldValue);
        evt.preventDefault();
        this.revertToPreviousValue();
      } else if (this.testPattern(newValue)) {
        //DEBUG && showDebugInfo("New value passed validation against", regex, newValue);
        this.updateCurrentValue(newValue);
      } else {
        //DEBUG && showDebugInfo("New value did NOT pass validation against", regex, newValue, "Reverting back to:", oldValue);
        evt.preventDefault();
        this.revertToPreviousValue();
      }

      /*
      //TODO: Angular2 -- is this needed at all?

      // make sure the model is consistent with last approach
      // needed even when we don't change what has been input -- see https://github.com/AlphaGit/ng-pattern-restrict/pull/43
      if (ngModelController) {
        scope.$apply(function () {
          ngModelController.$setViewValue(oldValue);
        });
      }
      */
  }

  private notThrows(testFn: Function, shouldReturnTruthy: boolean = false): boolean {
    try {
      return testFn() || !shouldReturnTruthy;
    } catch (e) {
      return false;
    }
  }

  private detectGetCaretPositionMethods(): void {
    let inputElement = this.el.nativeElement;

    // Chrome will throw on input.selectionStart of input type=number
    // See http://stackoverflow.com/a/21959157/147507
    let selectionStartTester = function(inputElement: HTMLInputElement) { return inputElement.selectionStart; };
    if (this.notThrows(selectionStartTester)) {
      this.getCaretPosition = this.getCaretPositionWithInputSelectionStart;
    } else {
      // IE 9- will use document.selection
      // TODO support IE 11+ with document.getSelection()
      let documentSelectionTester = function() { return (<any>document).selection; };
      if (this.notThrows(documentSelectionTester, true)) {
        this.getCaretPosition = this.getCaretPositionWithDocumentSelection;
      } else {
        this.getCaretPosition = this.getCaretPositionWithWindowSelection;
      }
    }
  }

  private detectSetCaretPositionMethods(): void {
    let input = <HTMLInputElement>this.el.nativeElement;
    if (typeof input.setSelectionRange === 'function') {
      this.setCaretPosition = this.setCaretPositionWithSetSelectionRange;
    } else if (typeof (<any>input).createTextRange === 'function') {
      this.setCaretPosition = this.setCaretPositionWithCreateTextRange;
    } else {
      this.setCaretPosition = this.setCaretPositionWithWindowSelection;
    }
  }

  private getCaretPosition: Function;
  private setCaretPosition: Function;

  private setCaretPositionWithSetSelectionRange(position: number): void {
    (<HTMLInputElement>this.el.nativeElement).setSelectionRange(position, position);
  }

  private setCaretPositionWithWindowSelection(position: number): void {
    let textRange = this.el.nativeElement.createTextRange();
    textRange.collapse(true);
    textRange.moveEnd('character', position);
    textRange.moveStart('character', position);
    textRange.select();
  }

  private setCaretPositionWithCreateTextRange(position: number): void {
    let s = window.getSelection();
    let selectionLength: Number;

    do {
      selectionLength = (String(s).length);
      (<any>s).modify('extend', 'backward', 'line');
    } while (selectionLength !== String(s).length);

    while (position--) {
      (<any>s).modify('move', 'forward', 'character');
    }
  }

  private getCaretPositionWithInputSelectionStart(): number {
    return (<HTMLInputElement>this.el.nativeElement).selectionStart;
  }

  private getCaretPositionWithDocumentSelection(): number {
    // create a selection range from where we are to the beggining
    // and measure how much we moved
    let range = (<any>document).selection.createRange();
    range.moveStart('character', this.el.nativeElement.val().length);
    return range.text.length;
  }

  private getCaretPositionWithWindowSelection(): number {
    let s = window.getSelection();
    let originalSelectionLength = String(s).length;
    let selectionLength: number;
    let didReachZero: boolean = false;
    let detectedCaretPosition: number;
    let restorePositionCounter: number;

    do {
      selectionLength = String(s).length;
      (<any>s).modify('extend', 'backward', 'character');
      // we're undoing a selection, and starting a new one towards the beggining of the string
      if (String(s).length === 0) {
        didReachZero = true;
      }
    } while (selectionLength !== String(s).length);

    detectedCaretPosition = didReachZero ? selectionLength : selectionLength - originalSelectionLength;
    s.collapseToStart();

    restorePositionCounter = detectedCaretPosition;
    while (restorePositionCounter-- > 0) {
      (<any>s).modify('move', 'forward', 'character');
    }
    while (originalSelectionLength-- > 0) {
      (<any>s).modify('extend', 'forward', 'character');
    }

    return detectedCaretPosition;
  }

  private revertToPreviousValue(): void {
    this.el.nativeElement.val(this.oldValue);

    if (typeof(this.caretPosition) !== 'undefined') {
      this.setCaretPosition(this.caretPosition);
    }
  }

  private updateCurrentValue(newValue: string): void {
    this.oldValue = newValue;
    this.caretPosition = this.getCaretPosition();
  }

  // HACK: Opera 12 won't give us a wrong validity status although the input is invalid
  // we can select the whole text and check the selection size
  // Congratulations to IE 11 for doing the same but not returning the selection.
  private getValueLengthThroughSelection(input: ElementRef): number {
    // only do this on opera, since it'll mess up the caret position
    // and break Firefox functionality
    if (!/Opera/i.test(navigator.userAgent)) {
      return 0;
    }

    input.nativeElement.focus();
    document.execCommand('selectAll');
    let focusNode = window.getSelection().focusNode;
    return (<any>(focusNode || {})).selectionStart || 0;
  }

  private testPattern(value: string): boolean {
    let regex: RegExp;
    try {
      //TODO avoid genering RegExp each time, create cached version that updates only on changes to the bound property
      regex = new RegExp(this.pattern);
    } catch (e) {
      throw `Invalid RegEx string parsed for ngPatternRestrict: ${this.pattern}`;
    }

    return regex.test(value);
  }
};
