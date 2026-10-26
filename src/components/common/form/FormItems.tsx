import get from 'lodash/get';
import React, {
  Fragment,
  type FC,
} from 'react';
import { type App } from 'obsidian';
import Control from './Control';
import { SETTING_GROUPS, groupRank } from 'src/settingGroups';

function isShow(field: FieldSchema<ISettings>, settings: ISettings) {
  if (!field.when) {
    return true;
  }

  if (typeof field.when === 'function') {
    return field.when(settings);
  }

  return get(settings, field.when.path) === field.when.flag;
}

const FormItems: FC<{
  formSchema: FormSchema<ISettings>;
  settings: ISettings;
  update: (data: ISettings) => void;
  app: App;
}> = ({ formSchema, settings, update, app }) => {
  const visibleFields = formSchema
    .filter(fieldSchema => isShow(fieldSchema, settings))
    .sort((a, b) => groupRank(a.group) - groupRank(b.group));
  let lastGroup: string | undefined;

  return (
    <>
      {visibleFields.map(fieldSchema => {
        const group = fieldSchema.group && fieldSchema.group !== lastGroup
          ? SETTING_GROUPS.find(entry => entry.id === fieldSchema.group)
          : undefined;
        if (fieldSchema.group) lastGroup = fieldSchema.group;

        return (
          <Fragment key={fieldSchema.path}>
            {group && (
              <div className='export-image-form-group'>
                <h4>{group.title}</h4>
                <p>{group.description}</p>
              </div>
            )}
            <div
              className='setting-item'
              style={{ padding: '10px 0' }}
            >
              <div className='setting-item-info'>
                <div className='setting-item-name'>{fieldSchema.label}</div>
                {fieldSchema.desc && (
                  <div className='setting-item-description'>
                    {fieldSchema.desc}
                  </div>
                )}
              </div>
              <div className='setting-item-control'>
                <Control
                  fieldSchema={fieldSchema}
                  setting={settings}
                  update={update}
                  app={app}
                ></Control>
              </div>
            </div>
          </Fragment>
        );
      })}
    </>
  );
};

export default FormItems;
