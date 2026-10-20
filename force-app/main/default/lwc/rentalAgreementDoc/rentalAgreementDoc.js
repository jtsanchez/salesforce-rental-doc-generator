import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord, updateRecord, notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import { subscribe, unsubscribe } from 'lightning/empApi';

import OPPORTUNITY_OBJECT from '@salesforce/schema/Opportunity';
import STAGE_FIELD from '@salesforce/schema/Opportunity.StageName';
import STATE_FIELD from '@salesforce/schema/Opportunity.Property_State__c';
import TYPE_FIELD from '@salesforce/schema/Opportunity.Property_Type__c';
import FREQUENCY_FIELD from '@salesforce/schema/Opportunity.Rent_Payment_Frequency__c';

import generatePdf from '@salesforce/apex/RentalAgreementPdfController.generatePdf';

const AGENCY_NAME = 'Harbourside Property Management (Demo)';

// Change Data Capture channel: pushes changes made anywhere (other users, flows, API, list views)
const CDC_CHANNEL = '/data/OpportunityChangeEvent';

// Fields the document lets you edit. Each is saved straight back to the Opportunity.
const EDITABLE_FIELDS = [
    'StageName',
    'CloseDate',
    'Tenant_Name__c',
    'Tenant_Email__c',
    'Tenant_Phone__c',
    'Property_Address__c',
    'Property_Suburb__c',
    'Property_State__c',
    'Property_Postcode__c',
    'Property_Type__c',
    'Bedrooms__c',
    'Bathrooms__c',
    'Lease_Start_Date__c',
    'Lease_Term_Months__c',
    'Weekly_Rent__c',
    'Rent_Payment_Frequency__c',
    'Bond_Amount__c',
    'Pets_Allowed__c',
    'Special_Conditions__c'
];

// Formula fields: calculated by Salesforce on save, shown read-only in the document.
const CALCULATED_FIELDS = ['Lease_End_Date__c', 'Annual_Rent__c', 'Bond_Weeks__c'];

const NUMERIC_FIELDS = new Set([
    'Bedrooms__c',
    'Bathrooms__c',
    'Lease_Term_Months__c',
    'Weekly_Rent__c',
    'Bond_Amount__c'
]);

const FIELDS_TO_LOAD = [
    'Opportunity.Name',
    'Opportunity.IsClosed',
    'Opportunity.Account.Name',
    'Opportunity.Owner.Name',
    ...EDITABLE_FIELDS.map((f) => 'Opportunity.' + f),
    ...CALCULATED_FIELDS.map((f) => 'Opportunity.' + f)
];

const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const BLANK = '________';

function toErrorList(error) {
    const messages = [];
    const body = error && error.body;
    if (Array.isArray(body)) {
        body.forEach((b) => b && b.message && messages.push(b.message));
    } else if (body) {
        const output = body.output;
        if (output && (output.errors || output.fieldErrors)) {
            (output.errors || []).forEach((e) => e.message && messages.push(e.message));
            Object.keys(output.fieldErrors || {}).forEach((field) => {
                output.fieldErrors[field].forEach((e) => e.message && messages.push(e.message));
            });
        }
        if (!messages.length && body.message) {
            messages.push(body.message);
        }
    } else if (error && error.message) {
        messages.push(error.message);
    }
    // The same validation message can appear under both errors and fieldErrors.
    const unique = Array.from(new Set(messages));
    return unique.length ? unique : ['Something went wrong. Please try again.'];
}

export default class RentalAgreementDoc extends NavigationMixin(LightningElement) {
    @api recordId;

    agencyName = AGENCY_NAME;

    record;
    draft = {};
    errorMessages = [];
    loadError;
    remoteChanged = false;
    syncNote = '';
    lastSynced = '';
    isSaving = false;
    isGenerating = false;

    _subscription;
    _saving = false;
    _graceUntil = 0;
    _noteTimer;

    // ---------------------------------------------------------------- lifecycle

    connectedCallback() {
        subscribe(CDC_CHANNEL, -1, (message) => this.handleChangeEvent(message))
            .then((response) => {
                this._subscription = response;
            })
            .catch(() => {
                // CDC is an enhancement. LDS still keeps the document in sync for changes made on this page.
            });
    }

    disconnectedCallback() {
        if (this._subscription) {
            unsubscribe(this._subscription, () => {});
        }
        clearTimeout(this._noteTimer);
    }

    // --------------------------------------------------------------------- data

    @wire(getObjectInfo, { objectApiName: OPPORTUNITY_OBJECT })
    objectInfo;

    @wire(getPicklistValues, { recordTypeId: '$defaultRecordTypeId', fieldApiName: STAGE_FIELD })
    stageValues;

    @wire(getPicklistValues, { recordTypeId: '$defaultRecordTypeId', fieldApiName: STATE_FIELD })
    stateValues;

    @wire(getPicklistValues, { recordTypeId: '$defaultRecordTypeId', fieldApiName: TYPE_FIELD })
    typeValues;

    @wire(getPicklistValues, { recordTypeId: '$defaultRecordTypeId', fieldApiName: FREQUENCY_FIELD })
    frequencyValues;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS_TO_LOAD })
    wiredRecord({ data, error }) {
        if (data) {
            const previous = this.record;
            this.record = data;
            this.loadError = undefined;
            this.lastSynced = new Date().toLocaleTimeString('en-AU');
            this.pruneDraft();

            const changedUnderneathUs =
                previous &&
                previous.lastModifiedDate !== data.lastModifiedDate &&
                !this._saving &&
                Date.now() > this._graceUntil;
            if (changedUnderneathUs) {
                this.handleRemoteChange();
            }
        } else if (error) {
            this.loadError = toErrorList(error).join(' ');
        }
    }

    get defaultRecordTypeId() {
        return this.objectInfo && this.objectInfo.data ? this.objectInfo.data.defaultRecordTypeId : undefined;
    }

    // Opportunity changed via LDS-unaware paths (another user, Flow, API...). Re-fetch through LDS.
    handleChangeEvent(message) {
        const header = message && message.data && message.data.payload && message.data.payload.ChangeEventHeader;
        if (header && Array.isArray(header.recordIds) && header.recordIds.includes(this.recordId)) {
            notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
        }
    }

    handleRemoteChange() {
        if (this.hasChanges) {
            this.remoteChanged = true;
        } else {
            this.flashNote('Updated just now from the Opportunity record');
        }
    }

    flashNote(text) {
        this.syncNote = text;
        clearTimeout(this._noteTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._noteTimer = setTimeout(() => {
            this.syncNote = '';
        }, 5000);
    }

    // -------------------------------------------------------------- field state

    fieldValue(apiName) {
        const field = this.record && this.record.fields[apiName];
        return field ? field.value : null;
    }

    normalise(apiName, raw) {
        if (apiName === 'Pets_Allowed__c') {
            return !!raw;
        }
        if (raw === '' || raw === undefined || raw === null) {
            return null;
        }
        return NUMERIC_FIELDS.has(apiName) ? Number(raw) : raw;
    }

    isSameAsRecord(apiName, value) {
        const original = this.normalise(apiName, this.fieldValue(apiName));
        return original === value;
    }

    pruneDraft() {
        const keys = Object.keys(this.draft);
        const next = {};
        keys.forEach((apiName) => {
            if (!this.isSameAsRecord(apiName, this.draft[apiName])) {
                next[apiName] = this.draft[apiName];
            }
        });
        if (Object.keys(next).length !== keys.length) {
            this.draft = next;
        }
    }

    // The values the document shows: unsaved edits win over the saved record.
    get v() {
        const out = {};
        if (!this.record) {
            return out;
        }
        EDITABLE_FIELDS.forEach((apiName) => {
            out[apiName] = Object.prototype.hasOwnProperty.call(this.draft, apiName)
                ? this.draft[apiName]
                : this.fieldValue(apiName);
        });
        out.Name = this.fieldValue('Name');
        return out;
    }

    get isReady() {
        return !!this.record;
    }

    get isLocked() {
        return this.fieldValue('IsClosed') === true;
    }

    get hasChanges() {
        return Object.keys(this.draft).length > 0;
    }

    get changeCount() {
        return Object.keys(this.draft).length;
    }

    get saveDisabled() {
        return !this.hasChanges || this.isSaving || this.isLocked;
    }

    get discardDisabled() {
        return !this.hasChanges || this.isSaving;
    }

    get generateDisabled() {
        return this.isGenerating || this.isSaving;
    }

    get hasErrors() {
        return this.errorMessages.length > 0;
    }

    get errorItems() {
        return this.errorMessages.map((text, index) => ({ key: 'e' + index, text }));
    }

    get accountName() {
        const account = this.record && this.record.fields.Account && this.record.fields.Account.value;
        return account ? account.fields.Name.value : '';
    }

    get ownerName() {
        const owner = this.record && this.record.fields.Owner && this.record.fields.Owner.value;
        return owner ? owner.fields.Name.value : '';
    }

    // ----------------------------------------------------------------- options

    get stageOptions() {
        return this.stageValues.data ? this.stageValues.data.values : [];
    }

    get stateOptions() {
        return this.stateValues.data ? this.stateValues.data.values : [];
    }

    get typeOptions() {
        return this.typeValues.data ? this.typeValues.data.values : [];
    }

    get frequencyOptions() {
        return this.frequencyValues.data ? this.frequencyValues.data.values : [];
    }

    // -------------------------------------------------- calculated (read-only)

    get leaseEndDisplay() {
        return this.formatDate(this.fieldValue('Lease_End_Date__c'));
    }

    get annualRentDisplay() {
        const value = this.fieldValue('Annual_Rent__c');
        return value === null || value === undefined ? '' : AUD.format(value);
    }

    get bondWeeksDisplay() {
        const value = this.fieldValue('Bond_Weeks__c');
        return value === null || value === undefined ? '' : value.toFixed(1) + ' weeks of rent';
    }

    // ------------------------------------------- live prose (updates as you type)

    formatDate(iso) {
        if (!iso) {
            return '';
        }
        return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    money(value) {
        return value === null || value === undefined ? BLANK : AUD.format(value);
    }

    get premisesClause() {
        const v = this.v;
        const address = [v.Property_Address__c, v.Property_Suburb__c, v.Property_State__c, v.Property_Postcode__c]
            .filter((part) => part)
            .join(' ');
        const type = v.Property_Type__c ? v.Property_Type__c.toLowerCase() : 'dwelling';
        const beds = v.Bedrooms__c === null || v.Bedrooms__c === undefined ? BLANK : v.Bedrooms__c;
        const baths = v.Bathrooms__c === null || v.Bathrooms__c === undefined ? BLANK : v.Bathrooms__c;
        return (
            'The Landlord lets to the Tenant the residential premises at ' +
            (address || BLANK) +
            ', being a ' + beds + '-bedroom, ' + baths + '-bathroom ' + type + '.'
        );
    }

    get termClause() {
        const v = this.v;
        const start = this.formatDate(v.Lease_Start_Date__c) || BLANK;
        const term = v.Lease_Term_Months__c === null || v.Lease_Term_Months__c === undefined ? BLANK : v.Lease_Term_Months__c;
        return 'The tenancy is for a fixed term of ' + term + ' months commencing on ' + start + '.';
    }

    get rentClause() {
        const v = this.v;
        const frequency = v.Rent_Payment_Frequency__c ? v.Rent_Payment_Frequency__c.toLowerCase() : BLANK;
        return (
            'The Tenant will pay rent of ' + this.money(v.Weekly_Rent__c) +
            ' per week, payable ' + frequency + ' in advance.'
        );
    }

    get bondClause() {
        return (
            'A rental bond of ' + this.money(this.v.Bond_Amount__c) +
            ' is payable by the Tenant before taking possession and must be lodged with the relevant state or territory bond authority.'
        );
    }

    get petsClause() {
        return this.v.Pets_Allowed__c
            ? "Pets are permitted with the Landlord's written consent."
            : 'Pets are not permitted.';
    }

    // ----------------------------------------------------------------- actions

    handleChange(event) {
        const apiName = event.target.dataset.field;
        if (!apiName) {
            return;
        }
        const raw = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        const value = this.normalise(apiName, raw);

        const next = { ...this.draft };
        if (this.isSameAsRecord(apiName, value)) {
            delete next[apiName];
        } else {
            next[apiName] = value;
        }
        this.draft = next;
        this.errorMessages = [];
    }

    handleDiscard() {
        this.draft = {};
        this.errorMessages = [];
        this.remoteChanged = false;
    }

    async handleSave() {
        if (this.saveDisabled) {
            return;
        }
        this.isSaving = true;
        this._saving = true;
        this.errorMessages = [];
        try {
            await updateRecord({ fields: { Id: this.recordId, ...this.draft } });
            this.draft = {};
            this.remoteChanged = false;
            // Formula fields (end date, annual rent, bond weeks) are recalculated by the server.
            await notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Saved to Opportunity',
                    message: 'The Opportunity record now matches this document.',
                    variant: 'success'
                })
            );
        } catch (error) {
            this.errorMessages = toErrorList(error);
        } finally {
            this._graceUntil = Date.now() + 2000;
            this._saving = false;
            this.isSaving = false;
        }
    }

    async handleGeneratePdf() {
        if (this.hasChanges) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Save your changes first',
                    message: 'The PDF is generated from the saved Opportunity, so save (or discard) your edits.',
                    variant: 'warning'
                })
            );
            return;
        }
        this.isGenerating = true;
        try {
            const documentId = await generatePdf({ opportunityId: this.recordId });
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'PDF generated',
                    message: 'A new copy was saved to this Opportunity\'s Files.',
                    variant: 'success'
                })
            );
            this[NavigationMixin.Navigate]({
                type: 'standard__namedPage',
                attributes: { pageName: 'filePreview' },
                state: { selectedRecordId: documentId }
            });
        } catch (error) {
            this.errorMessages = toErrorList(error);
        } finally {
            this.isGenerating = false;
        }
    }
}
